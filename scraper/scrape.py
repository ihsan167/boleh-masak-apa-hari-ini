"""
Boleh Masak Apa Hari Ini — Recipe Scraper (Raw Content Only)
Scrapes raw blog content from Malaysian food blogs and saves to files.
LLM processing is done separately via Claude Code.
Runs daily via GitHub Actions.
"""

import os
import json
import re
import requests
from datetime import datetime, timezone
from bs4 import BeautifulSoup

SCRAPER_UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
}

RAW_DIR = os.path.join(os.path.dirname(__file__), "raw")
PROCESSED_FILE = os.path.join(os.path.dirname(__file__), "processed.json")


def load_processed() -> dict:
    """Load the processed tracking file."""
    if os.path.exists(PROCESSED_FILE):
        with open(PROCESSED_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_processed(data: dict):
    """Save the processed tracking file."""
    with open(PROCESSED_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def slugify(text: str) -> str:
    """Convert text to a safe filename slug."""
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_]+', '-', text)
    return text[:80]


def save_raw_recipe(name: str, chef: str, source_url: str, image_url: str, raw_text: str) -> str | None:
    """Save raw recipe content to a JSON file. Returns filename or None if already exists."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    slug = slugify(name)
    filename = f"{today}_{slug}.json"
    filepath = os.path.join(RAW_DIR, filename)

    # Skip if file already exists
    if os.path.exists(filepath):
        return None

    data = {
        "name": name,
        "chef": chef,
        "source_url": source_url,
        "image_url": image_url,
        "raw_text": raw_text,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
    }

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    # Add to processed.json as "pending"
    processed = load_processed()
    processed[filename] = "pending"
    save_processed(processed)

    return filename


# ---------------------------------------------------------------------------
# Scraper: Azie Kitchen
# ---------------------------------------------------------------------------

def scrape_azie_kitchen(max_pages: int = 2) -> int:
    print("\n=== Scraping Azie Kitchen ===")
    count = 0

    for page in range(1, max_pages + 1):
        url = f"https://www.aziekitchen.com/page/{page}/"
        print(f"  Page {page}: {url}")

        try:
            resp = requests.get(url, headers=SCRAPER_UA, timeout=15)
            if resp.status_code != 200:
                print(f"  Skipping page {page} (status {resp.status_code})")
                continue
        except Exception as e:
            print(f"  Error: {e}")
            continue

        soup = BeautifulSoup(resp.text, "html.parser")

        for article in soup.select("article"):
            link_tag = article.select_one("a[href]")
            if not link_tag:
                continue

            recipe_url = link_tag["href"]

            try:
                resp2 = requests.get(recipe_url, headers=SCRAPER_UA, timeout=15)
                if resp2.status_code != 200:
                    continue
            except Exception:
                continue

            soup2 = BeautifulSoup(resp2.text, "html.parser")

            title_tag = soup2.select_one("h1.entry-title, h2.entry-title, h1")
            if not title_tag:
                continue
            name = title_tag.get_text(strip=True)

            image_url = ""
            img_tag = soup2.select_one(".entry-content img, article img")
            if img_tag:
                image_url = img_tag.get("src", "")

            content = soup2.select_one(".entry-content")
            if not content:
                continue

            raw_text = content.get_text("\n", strip=True)

            result = save_raw_recipe(name, "Azie Kitchen", recipe_url, image_url, raw_text)
            if result:
                count += 1
                print(f"  Saved: {name}")
            else:
                print(f"  Already exists: {name}")

    return count


# ---------------------------------------------------------------------------
# Scraper: Rasa Malaysia
# ---------------------------------------------------------------------------

def scrape_rasa_malaysia(max_pages: int = 2) -> int:
    print("\n=== Scraping Rasa Malaysia ===")
    count = 0

    for page in range(1, max_pages + 1):
        url = f"https://rasamalaysia.com/page/{page}/"
        print(f"  Page {page}: {url}")

        try:
            resp = requests.get(url, headers=SCRAPER_UA, timeout=15)
            if resp.status_code != 200:
                print(f"  Skipping page {page} (status {resp.status_code})")
                continue
        except Exception as e:
            print(f"  Error: {e}")
            continue

        soup = BeautifulSoup(resp.text, "html.parser")
        links = soup.select("h2.entry-title a, h2 a[href*='rasamalaysia.com']")

        for link in links:
            recipe_url = link.get("href", "")
            if not recipe_url:
                continue

            try:
                resp2 = requests.get(recipe_url, headers=SCRAPER_UA, timeout=15)
                if resp2.status_code != 200:
                    continue
            except Exception:
                continue

            soup2 = BeautifulSoup(resp2.text, "html.parser")

            title_tag = soup2.select_one("h2.wprm-recipe-name, h1.entry-title, h1")
            if not title_tag:
                continue
            name = title_tag.get_text(strip=True)

            image_url = ""
            img_tag = soup2.select_one(".wprm-recipe-image img, .entry-content img")
            if img_tag:
                image_url = img_tag.get("src", "")

            content = soup2.select_one(".entry-content, .wprm-recipe-container")
            raw_text = content.get_text("\n", strip=True) if content else ""

            if not raw_text:
                continue

            result = save_raw_recipe(name, "Rasa Malaysia", recipe_url, image_url, raw_text)
            if result:
                count += 1
                print(f"  Saved: {name}")
            else:
                print(f"  Already exists: {name}")

    return count


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print(f"=== Boleh Masak Apa — Raw Recipe Scraper ===")
    print(f"Time: {datetime.now(timezone.utc).isoformat()}")

    os.makedirs(RAW_DIR, exist_ok=True)

    total = 0
    total += scrape_rasa_malaysia(max_pages=2)
    total += scrape_azie_kitchen(max_pages=2)

    # Count stats
    processed = load_processed()
    pending = sum(1 for v in processed.values() if v == "pending")
    done = sum(1 for v in processed.values() if v == "done")

    print(f"\n=== Done! ===")
    print(f"  New files saved: {total}")
    print(f"  Total pending: {pending}")
    print(f"  Total processed: {done}")

    # Save scrape log
    log = {
        "last_scrape": datetime.now(timezone.utc).isoformat(),
        "new_recipes_saved": total,
        "total_pending": pending,
        "total_processed": done,
    }
    with open(os.path.join(os.path.dirname(__file__), "last_scrape.json"), "w") as f:
        json.dump(log, f, indent=2)


if __name__ == "__main__":
    main()
