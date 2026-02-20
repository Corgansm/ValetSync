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
    
    # 1. Base Peak Capacity Score
    # Parades and Panoply automatically trigger a Level 10 impact
    if 'propst' in venue or 'havoc' in title or 'parade' in title or 'panoply' in title:
        max_impact = 10
    elif 'concert hall' in venue or 'mark c' in venue:
        max_impact = 7
    elif 'mars music' in venue:
        max_impact = 6
    elif 'hall' in venue or 'convention' in venue:
        max_impact = 4
    elif 'big spring' in venue or 'park' in venue:
        max_impact = 4 # Reduced impact for standard park events
    else:
        max_impact = 3
        
    # 2. Estimate Event Duration
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
    print("Fetching Huntsville.org events for parades, Panoply, and park events...")
    try:
        page = browser.new_page(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        page.goto("https://www.huntsville.org/events/", wait_until="networkidle")
        
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
                
                venue = location_icon.parent.text.strip() if location_icon and location_icon.parent else "Unknown Venue"
                title = title_elem.text.strip() if title_elem else "Unknown Event"
                
                title_lower = title.lower()
                venue_lower = venue.lower()
                
                is_park = 'big spring' in venue_lower or 'big spring' in title_lower
                is_downtown = 'downtown' in venue_lower
                is_special = 'parade' in title_lower or 'panoply' in title_lower
                
                if is_park or is_downtown or is_special:
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
        print(f"Error scraping Huntsville.org: {e}")
    return events

if __name__ == '__main__':
    all_events = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            
            all_events.extend(scrape_vbc(browser))
            all_events.extend(scrape_huntsville_org(browser))
            
            browser.close()
            
            with open(JSON_FILE_PATH, 'w', encoding='utf-8') as f:
                json.dump(all_events, f, indent=4, ensure_ascii=False)
            print(f"Successfully saved {len(all_events)} events to {JSON_FILE_PATH}")

    except Exception as e:
        print(f"Master scraping error: {e}")
