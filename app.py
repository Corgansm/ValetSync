import urllib.request
import re
import json
import os
import time
from datetime import datetime, timedelta
from playwright.sync_api import sync_playwright
from bs4 import BeautifulSoup

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
JSON_PATHS = {
    'events': os.path.join(BASE_DIR, 'events.json'),
    'weather': os.path.join(BASE_DIR, 'weather.json')
}

def parse_time(time_str):
    if not time_str or "TBA" in time_str.upper():
        return None
    match = re.search(r'(\d{1,2}:\d{2}\s*[APMapm]{2})', time_str)
    if match:
        clean_time = match.group(1).upper().replace(' ', '')
        return datetime.strptime(clean_time, '%I:%M%p')
    return None

def calculate_temporal_impact(title, venue, time_str):
    title = title.lower()
    venue = venue.lower()
    
    if 'propst' in venue or 'havoc' in title or 'parade' in title or 'panoply' in title:
        max_impact = 10
    elif 'concert hall' in venue or 'mark c' in venue:
        max_impact = 3
    elif 'mars music' in venue:
        max_impact = 3
    elif 'hall' in venue or 'convention' in venue:
        max_impact = 2
    elif 'big spring' in venue or 'park' in venue:
        max_impact = 3
    else:
        max_impact = 1
        
    if 'panoply' in title:
        duration_hours = 8.0 
    elif 'parade' in title:
        duration_hours = 2.0 
    elif 'havoc' in title:
        duration_hours = 2.5
    elif any(kw in title for kw in ['tour', 'comedy', 'concert', 'live']):
        duration_hours = 3.0
    elif any(kw in title for kw in ['rally', 'festival', 'market']):
        duration_hours = 4.0 
    elif any(kw in title for kw in ['expo', 'banquet']):
        duration_hours = 6.0
        max_impact = min(max_impact, 5) 
    else:
        duration_hours = 2.0
        
    start_dt = parse_time(time_str)
    
    if not start_dt:
        return {"error": "Time TBA", "static_impact": max_impact}
        
    arrival_start = start_dt - timedelta(hours=1.5)
    end_dt = start_dt + timedelta(hours=duration_hours)
    departure_end = end_dt + timedelta(hours=1.0)
    
    return {
        "arrival_rush": {
            "window": f"{arrival_start.strftime('%I:%M %p')} - {start_dt.strftime('%I:%M %p')}",
            "impact": int(max_impact * 0.8) 
        },
        "during_event": {
            "window": f"{start_dt.strftime('%I:%M %p')} - {end_dt.strftime('%I:%M %p')}",
            "impact": max(1, int(max_impact * 1.0)) 
        },
        "departure_rush": {
            "window": f"{end_dt.strftime('%I:%M %p')} - {departure_end.strftime('%I:%M %p')}",
            "impact": max_impact 
        }
    }

def scrape_weather_forecast():
    print("Fetching 7-day forecast for Huntsville from NWS...")
    forecast_dict = {}
    try:
        url = "https://api.weather.gov/gridpoints/HUN/75,54/forecast"
        req = urllib.request.Request(url, headers={'User-Agent': 'ValetSync/1.0'})
        
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            
            for period in data['properties']['periods']:
                date_str = period['startTime'][:10]
                forecast = period['shortForecast'].lower()
                
                if date_str not in forecast_dict:
                    forecast_dict[date_str] = {
                        "condition": period['shortForecast'],
                        "is_raining": False,
                        "is_storming": False
                    }
                
                if any(word in forecast for word in ['rain', 'shower', 'drizzle', 'precip']):
                    forecast_dict[date_str]["is_raining"] = True
                if any(word in forecast for word in ['thunder', 'storm', 't-storm']):
                    forecast_dict[date_str]["is_raining"] = True
                    forecast_dict[date_str]["is_storming"] = True
                    
        print(f"Weather forecast scraped for {len(forecast_dict)} days.")
    except Exception as e:
        print(f"Error fetching weather forecast: {e}")
        
    return forecast_dict

def parse_vbc_results(soup):
    """
    Parses the redesigned (2026) VBC events archive.
    Structure: .event-results > month blocks (h3 "July 2026") > day rows
    (span.hdg-1 = weekday, span.hdg-2 = day number) > event cards (div.group)
    containing an h4 title and li rows with icon-clock / icon-location-pin.
    """
    events = []
    results = soup.select_one('.event-results')
    if not results:
        return events

    for day_num_el in results.select('span.hdg-2'):
        day = day_num_el.get_text(strip=True)
        date_col = day_num_el.find_parent('div')
        day_row = date_col.find_parent('div') if date_col else None
        if not day_row:
            continue

        month_header = day_row.find_previous('h3')
        month_year = month_header.get_text(strip=True) if month_header else ""
        m = re.match(r'([A-Za-z]+)\s+(\d{4})', month_year)
        if m and day.isdigit():
            date_str = f"{m.group(1)} {int(day)}, {m.group(2)}"
        else:
            date_str = month_year or "Unknown Date"

        for card in day_row.select('div.group'):
            title_elem = card.find('h4')
            if not title_elem:
                continue
            title = title_elem.get_text(strip=True)

            time_str = "Time TBA"
            venue = "Von Braun Center"
            for li in card.select('li'):
                svg = li.find('svg')
                svg_class = ' '.join(svg.get('class', [])) if svg else ''
                text = li.get_text(strip=True)
                if 'icon-clock' in svg_class:
                    time_str = text
                elif 'icon-location-pin' in svg_class:
                    venue = text

            link_elem = card.select_one('a[href]')
            img_elem = card.find('img')
            image = ""
            if img_elem:
                image = img_elem.get('src', '')
                if not image.startswith('http'):
                    srcset = img_elem.get('srcset', '')
                    if srcset:
                        image = srcset.split(',')[0].strip().split(' ')[0]

            timeline = calculate_temporal_impact(title, venue, time_str)
            event_data = {
                "title": title,
                "date": date_str,
                "time": time_str,
                "venue": venue,
                "impact_timeline": timeline,
                "url": link_elem['href'] if link_elem else "",
                "image": image,
                "source": "VBC"
            }
            if event_data not in events:
                events.append(event_data)
    return events

def scrape_vbc(browser):
    events = []
    print("Fetching VBC schedule...")
    try:
        page = browser.new_page(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        page.goto("https://www.vonbrauncenter.com/events/", wait_until="networkidle")

        max_pages = 25
        for _ in range(max_pages):
            try:
                page.wait_for_selector('.event-results h4', timeout=10000)
            except:
                break

            soup = BeautifulSoup(page.content(), 'html.parser')
            for event_data in parse_vbc_results(soup):
                if event_data not in events:
                    events.append(event_data)

            # Pagination is now AJAX buttons: <button class="next page-numbers" data-value="N">
            next_button = page.locator('.events__pagination button.next')
            if next_button.count() == 0:
                break
            first_title = page.locator('.event-results h4').first.inner_text()
            next_button.first.click()
            try:
                # Wait for results to swap out (content change), then settle.
                page.wait_for_function(
                    """(oldTitle) => {
                        const h = document.querySelector('.event-results h4');
                        return h && h.innerText !== oldTitle;
                    }""",
                    arg=first_title, timeout=10000
                )
            except:
                page.wait_for_timeout(2500)
            page.wait_for_load_state("networkidle")

        page.close()
    except Exception as e:
        print(f"Error scraping VBC: {e}")
    print(f"VBC events found: {len(events)}")
    return events

def scrape_big_spring_park(browser):
    events = []
    print("Fetching DHI events directly from the hidden Time.ly widget...")
    try:
        page = browser.new_page(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        page.goto("https://calendar.time.ly/fuwat0y5/?tags=677452611", wait_until="domcontentloaded")
        
        try:
            page.wait_for_selector('.timely-tile-event', timeout=10000)
            page.wait_for_timeout(3000) 
        except:
            print("Note: Time.ly loaded, but no events triggered.")
            
        while True:
            load_more_btn = page.locator('#timely-load-more-button')
            if load_more_btn.count() > 0 and load_more_btn.is_visible():
                print("Clicking 'Load More' on Time.ly...")
                load_more_btn.click()
                page.wait_for_timeout(100) 
            else:
                break
        
        soup = BeautifulSoup(page.content(), 'html.parser')
        event_cards = soup.select('.timely-tile-event, .timely-event') 
        
        current_year = datetime.now().year

        for card in event_cards:
            title_elem = card.select_one('.timely-title-text span')
            title = title_elem.text.strip() if title_elem else card.get('aria-label', '')
            
            venue_elem = card.select_one('.timely-tile-event-venue')
            raw_venue = venue_elem.text.strip() if venue_elem else ""
            
            title_lower = title.lower()
            venue_lower = raw_venue.lower()
            
            if 'big spring' in title_lower or 'big spring' in venue_lower or 'parade' in title_lower or 'panoply' in title_lower:
                time_dt_elem = card.select_one('.timely-tile-event-time')
                raw_time_str = time_dt_elem.text.strip() if time_dt_elem else ""
                
                date_part = ""
                time_part = "Time TBA"

                if '@' in raw_time_str:
                    parts = raw_time_str.split('@')
                    raw_date = parts[0].strip() 
                    time_part = parts[1].strip() 
                    
                    if ',' in raw_date:
                        date_part = f"{raw_date.split(',')[-1].strip()}, {current_year}"
                    else:
                        date_part = f"{raw_date}, {current_year}"
                else:
                    month_elem = card.select_one('.timely-month')
                    day_elem = card.select_one('.timely-day')
                    if month_elem and day_elem:
                        date_part = f"{month_elem.text.strip()} {day_elem.text.strip()}, {current_year}"
                
                clean_title = title.split('@')[0].strip()
                venue = "Big Spring Park" if 'big spring' in title_lower or 'big spring' in venue_lower else (raw_venue if raw_venue else "Downtown Huntsville")
                timeline = calculate_temporal_impact(clean_title, venue, time_part)
                
                event_data = {
                    "title": clean_title,
                    "date": date_part, 
                    "time": time_part,
                    "venue": venue,
                    "impact_timeline": timeline,
                    "source": "DHI Time.ly Calendar"
                }
                if event_data not in events:
                    events.append(event_data)
                        
        page.close()
    except Exception as e:
        print(f"Error scraping Time.ly calendar: {e}")
    return events

if __name__ == '__main__':
    all_events = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            
            all_events.extend(scrape_vbc(browser))
            all_events.extend(scrape_big_spring_park(browser))
            
            browser.close()
            
            weather_info = scrape_weather_forecast()
            
            with open(JSON_PATHS['events'], 'w', encoding='utf-8') as f:
                json.dump(all_events, f, indent=4, ensure_ascii=False)
            
            with open(JSON_PATHS['weather'], 'w', encoding='utf-8') as f:
                json.dump(weather_info, f, indent=4)
                
            print(f"Done. Events: {len(all_events)} | Weather Data: {len(weather_info)} days generated.")

    except Exception as e:
        print(f"Master scraping error: {e}")