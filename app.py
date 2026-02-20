import re
import json
import os
from datetime import datetime, timedelta
from playwright.sync_api import sync_playwright
from bs4 import BeautifulSoup

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
JSON_FILE_PATH = os.path.join(BASE_DIR, 'events.json')

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
        max_impact = 7
    elif 'mars music' in venue:
        max_impact = 6
    elif 'hall' in venue or 'convention' in venue:
        max_impact = 4
    elif 'big spring' in venue or 'park' in venue:
        max_impact = 4 
    else:
        max_impact = 3
        
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
            "impact": max(1, int(max_impact * 0.2)) 
        },
        "departure_rush": {
            "window": f"{end_dt.strftime('%I:%M %p')} - {departure_end.strftime('%I:%M %p')}",
            "impact": max_impact 
        }
    }

def scrape_vbc(browser):
    events = []
    print("Fetching VBC schedule...")
    try:
        page = browser.new_page(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        page.goto("https://www.vonbrauncenter.com/events-tickets/upcoming-events/", wait_until="networkidle")
        
        while True:
            try:
                page.wait_for_selector('.shared-item.item', timeout=10000)
            except:
                break 
                
            soup = BeautifulSoup(page.content(), 'html.parser')
            event_cards = soup.select('.shared-item.item') 
            
            for card in event_cards:
                title_elem = card.select_one('h2 a')
                date_elem = card.select_one('.dates')
                time_elem = card.select_one('.starttime')
                location_icon = card.select_one('.fa-map-marker')
                
                venue = location_icon.parent.text.strip() if location_icon and location_icon.parent else "Von Braun Center"
                title = title_elem.text.strip() if title_elem else "Unknown Event"
                date = date_elem.text.strip() if date_elem else "Unknown Date"
                time_str = time_elem.text.strip() if time_elem else "Time TBA"
                
                timeline = calculate_temporal_impact(title, venue, time_str)
                
                event_data = {
                    "title": title,
                    "date": date,
                    "time": time_str,
                    "venue": venue,
                    "impact_timeline": timeline,
                    "source": "VBC"
                }
                if event_data not in events:
                    events.append(event_data)

            next_button = page.locator('.pager a').filter(has=page.locator('i.fa-caret-right:only-child')).first
            if next_button.count() > 0:
                if "disabled" in (next_button.get_attribute('class') or ""):
                    break
                next_button.click()
                page.wait_for_timeout(2000)
                page.wait_for_load_state("networkidle")
            else:
                break
        page.close()
    except Exception as e:
        print(f"Error scraping VBC: {e}")
    return events

def scrape_huntsville_org(browser):
    events = []
    print("Fetching Huntsville.org events for parades and Panoply...")
    try:
        page = browser.new_page(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        page.goto("https://www.huntsville.org/events/", wait_until="domcontentloaded", timeout=60000)
        
        while True:
            try:
                page.wait_for_selector('.shared-item.item', timeout=10000)
            except:
                break
                
            soup = BeautifulSoup(page.content(), 'html.parser')
            event_cards = soup.select('.shared-item.item') 
            print(f"Debug: Found {len(event_cards)} total events on current CVB page.")
            
            for card in event_cards:
                title_elem = card.select_one('h2 a')
                date_elem = card.select_one('.dates')
                time_elem = card.select_one('.starttime')
                location_icon = card.select_one('.fa-map-marker')
                
                venue = location_icon.parent.text.strip() if location_icon and location_icon.parent else "Unknown Venue"
                title = title_elem.text.strip() if title_elem else "Unknown Event"
                
                title_lower = title.lower()
                venue_lower = venue.lower()
                
                is_special = 'parade' in title_lower or 'panoply' in title_lower
                
                if is_special:
                    date = date_elem.text.strip() if date_elem else "Unknown Date"
                    time_str = time_elem.text.strip() if time_elem else "Time TBA"
                    
                    timeline = calculate_temporal_impact(title, venue, time_str)
                    events.append({
                        "title": title,
                        "date": date,
                        "time": time_str,
                        "venue": venue,
                        "impact_timeline": timeline,
                        "source": "Huntsville.org"
                    })

            next_button = page.locator('a', has_text=re.compile(r'Next Page', re.IGNORECASE)).first
            if next_button.count() > 0 and next_button.is_visible():
                if "disabled" in (next_button.get_attribute('class') or "").lower():
                    break
                next_button.click()
                page.wait_for_timeout(3000)
                page.wait_for_load_state("domcontentloaded")
            else:
                break
        page.close()
    except Exception as e:
        print(f"Error scraping Huntsville.org: {e}")
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
        
        soup = BeautifulSoup(page.content(), 'html.parser')
        
        # Target the exact angular class block provided
        event_cards = soup.select('.timely-tile-event, .timely-event') 
        print(f"Debug: Found {len(event_cards)} potential cards in Time.ly")
        
        for card in event_cards:
            # 1. Grab Title (Targeting the first span to avoid the venue string)
            title_elem = card.select_one('.timely-title-text span')
            title = title_elem.text.strip() if title_elem else card.get('aria-label', '')
            
            # 2. Grab Venue
            venue_elem = card.select_one('.timely-tile-event-venue')
            raw_venue = venue_elem.text.strip() if venue_elem else ""
            
            if 'big spring' in title.lower() or 'big spring' in raw_venue.lower():
                # 3. Grab combined Date and Time
                time_dt_elem = card.select_one('.timely-tile-event-time')
                raw_time_str = time_dt_elem.text.strip() if time_dt_elem else ""
                
                # Split "Mon, Feb 23 @ 5:30pm" into distinct variables
                if '@' in raw_time_str:
                    date_part = raw_time_str.split('@')[0].strip()
                    time_part = raw_time_str.split('@')[1].strip()
                else:
                    month_elem = card.select_one('.timely-month')
                    day_elem = card.select_one('.timely-day')
                    date_part = f"{month_elem.text.strip()} {day_elem.text.strip()}" if month_elem and day_elem else "Unknown Date"
                    time_part = raw_time_str if raw_time_str else "Time TBA"
                
                # Clean off venue from title if it carried over
                clean_title = title.split('@')[0].strip()
                venue = "Big Spring Park"
                
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
            all_events.extend(scrape_huntsville_org(browser))
            all_events.extend(scrape_big_spring_park(browser))
            
            browser.close()
            
            with open(JSON_FILE_PATH, 'w', encoding='utf-8') as f:
                json.dump(all_events, f, indent=4, ensure_ascii=False)
            print(f"Successfully saved {len(all_events)} events to {JSON_FILE_PATH}")

    except Exception as e:
        print(f"Master scraping error: {e}")
