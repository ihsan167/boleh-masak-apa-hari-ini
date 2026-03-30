"""
Boleh Masak Apa Hari Ini — Recipe Scraper
Scrapes Malaysian recipes from popular food blogs and saves to Supabase.
Runs daily via GitHub Actions.
"""

import os
import json
import hashlib
import requests
from datetime import datetime, timezone
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

SCRAPER_UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
}


# ---------------------------------------------------------------------------
# Supabase helpers
# ---------------------------------------------------------------------------

def recipe_exists(source_url: str) -> bool:
    """Check if a recipe with this source URL already exists."""
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/recipes",
        headers=HEADERS,
        params={"source_url": f"eq.{source_url}", "select": "id"},
    )
    return len(resp.json()) > 0


def insert_recipe(recipe: dict, ingredients: list[dict]):
    """Insert a recipe and its ingredients into Supabase."""
    # Insert recipe
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/recipes",
        headers={**HEADERS, "Prefer": "return=representation"},
        json=recipe,
    )
    if resp.status_code not in (200, 201):
        print(f"  ERROR inserting recipe: {resp.status_code} {resp.text}")
        return

    recipe_id = resp.json()[0]["id"]

    # Insert ingredients
    if ingredients:
        for ing in ingredients:
            ing["recipe_id"] = recipe_id

        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/recipe_ingredients",
            headers=HEADERS,
            json=ingredients,
        )
        if resp.status_code not in (200, 201):
            print(f"  ERROR inserting ingredients: {resp.status_code} {resp.text}")


# ---------------------------------------------------------------------------
# Scraper: Azie Kitchen (aziekitchen.com)
# ---------------------------------------------------------------------------

def scrape_azie_kitchen(max_pages: int = 2) -> int:
    """Scrape recipes from Azie Kitchen."""
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
            print(f"  Error fetching page: {e}")
            continue

        soup = BeautifulSoup(resp.text, "html.parser")
        articles = soup.select("article")

        for article in articles:
            link_tag = article.select_one("a[href]")
            if not link_tag:
                continue

            recipe_url = link_tag["href"]
            if recipe_exists(recipe_url):
                print(f"  Already exists: {recipe_url}")
                continue

            recipe_data = scrape_azie_recipe_page(recipe_url)
            if recipe_data:
                recipe, ingredients = recipe_data
                insert_recipe(recipe, ingredients)
                count += 1
                print(f"  Added: {recipe['name']}")

    return count


def scrape_azie_recipe_page(url: str):
    """Scrape a single Azie Kitchen recipe page."""
    try:
        resp = requests.get(url, headers=SCRAPER_UA, timeout=15)
        if resp.status_code != 200:
            return None
    except Exception:
        return None

    soup = BeautifulSoup(resp.text, "html.parser")

    # Get title
    title_tag = soup.select_one("h1.entry-title, h2.entry-title, h1")
    if not title_tag:
        return None
    name = title_tag.get_text(strip=True)

    # Get image
    image_url = ""
    img_tag = soup.select_one(".entry-content img, article img")
    if img_tag:
        image_url = img_tag.get("src", "")

    # Get content
    content = soup.select_one(".entry-content")
    if not content:
        return None

    text = content.get_text("\n", strip=True)

    # Try to extract ingredients and instructions from the text
    ingredients = extract_ingredients_from_text(text)
    instructions = extract_instructions_from_text(text)

    recipe = {
        "name": name,
        "chef": "Azie Kitchen",
        "source_url": url,
        "image_url": image_url,
        "instructions": instructions,
        "servings": 4,
    }

    return recipe, ingredients


# ---------------------------------------------------------------------------
# Scraper: Rasa Malaysia (rasamalaysia.com)
# ---------------------------------------------------------------------------

def scrape_rasa_malaysia(max_pages: int = 2) -> int:
    """Scrape recipes from Rasa Malaysia."""
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
            print(f"  Error fetching page: {e}")
            continue

        soup = BeautifulSoup(resp.text, "html.parser")
        links = soup.select("h2.entry-title a, h2 a[href*='rasamalaysia.com']")

        for link in links:
            recipe_url = link.get("href", "")
            if not recipe_url or recipe_exists(recipe_url):
                print(f"  Already exists or invalid: {recipe_url}")
                continue

            recipe_data = scrape_rasa_recipe_page(recipe_url)
            if recipe_data:
                recipe, ingredients = recipe_data
                insert_recipe(recipe, ingredients)
                count += 1
                print(f"  Added: {recipe['name']}")

    return count


def scrape_rasa_recipe_page(url: str):
    """Scrape a single Rasa Malaysia recipe page."""
    try:
        resp = requests.get(url, headers=SCRAPER_UA, timeout=15)
        if resp.status_code != 200:
            return None
    except Exception:
        return None

    soup = BeautifulSoup(resp.text, "html.parser")

    # Try structured recipe data (JSON-LD)
    recipe_data = extract_jsonld_recipe(soup)
    if recipe_data:
        recipe_data[0]["chef"] = "Rasa Malaysia"
        recipe_data[0]["source_url"] = url
        return recipe_data

    # Fallback: manual extraction
    title_tag = soup.select_one("h2.wprm-recipe-name, h1.entry-title, h1")
    if not title_tag:
        return None

    name = title_tag.get_text(strip=True)
    image_url = ""
    img_tag = soup.select_one(".wprm-recipe-image img, .entry-content img")
    if img_tag:
        image_url = img_tag.get("src", "")

    content = soup.select_one(".entry-content, .wprm-recipe-container")
    text = content.get_text("\n", strip=True) if content else ""

    ingredients = extract_ingredients_from_text(text)
    instructions = extract_instructions_from_text(text)

    recipe = {
        "name": name,
        "chef": "Rasa Malaysia",
        "source_url": url,
        "image_url": image_url,
        "instructions": instructions,
        "servings": 4,
    }

    return recipe, ingredients


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def extract_jsonld_recipe(soup: BeautifulSoup):
    """Try to extract recipe from JSON-LD structured data."""
    for script in soup.select('script[type="application/ld+json"]'):
        try:
            data = json.loads(script.string or "")
            # Handle @graph format
            if isinstance(data, dict) and "@graph" in data:
                for item in data["@graph"]:
                    if item.get("@type") == "Recipe":
                        data = item
                        break
                else:
                    continue
            # Handle list format
            if isinstance(data, list):
                for item in data:
                    if isinstance(item, dict) and item.get("@type") == "Recipe":
                        data = item
                        break
                else:
                    continue

            if not isinstance(data, dict) or data.get("@type") != "Recipe":
                continue

            name = data.get("name", "Unknown Recipe")
            image_url = ""
            img = data.get("image", "")
            if isinstance(img, list) and img:
                image_url = img[0] if isinstance(img[0], str) else img[0].get("url", "")
            elif isinstance(img, str):
                image_url = img

            # Parse ingredients
            raw_ingredients = data.get("recipeIngredient", [])
            ingredients = []
            for raw in raw_ingredients:
                parsed = parse_ingredient_string(raw)
                ingredients.append(parsed)

            # Parse instructions
            raw_instructions = data.get("recipeInstructions", [])
            steps = []
            for step in raw_instructions:
                if isinstance(step, str):
                    steps.append(step)
                elif isinstance(step, dict):
                    steps.append(step.get("text", ""))
            instructions = "\n".join(f"{i+1}. {s}" for i, s in enumerate(steps) if s)

            servings = 4
            try:
                servings = int(data.get("recipeYield", [4])[0]) if isinstance(data.get("recipeYield"), list) else int(data.get("recipeYield", 4))
            except (ValueError, TypeError, IndexError):
                pass

            recipe = {
                "name": name,
                "chef": "",
                "source_url": "",
                "image_url": image_url,
                "instructions": instructions,
                "servings": servings,
            }

            return recipe, ingredients

        except (json.JSONDecodeError, TypeError, KeyError):
            continue

    return None


def parse_ingredient_string(raw: str) -> dict:
    """Parse an ingredient string like '200g chicken breast' into structured data."""
    raw = raw.strip()
    quantity = 0
    unit = ""
    name = raw

    # Common patterns: "200g", "2 cups", "1/2 tsp", "3 biji"
    import re
    match = re.match(
        r'^([\d./]+)\s*(gram|g|kg|ml|liter|l|cup|cups|tbsp|tsp|sudu|cawan|biji|helai|keping|batang|ulas|peket|tin)?\s*(.+)',
        raw, re.IGNORECASE
    )
    if match:
        try:
            q = match.group(1)
            if "/" in q:
                parts = q.split("/")
                quantity = float(parts[0]) / float(parts[1])
            else:
                quantity = float(q)
        except (ValueError, ZeroDivisionError):
            quantity = 0
        unit = (match.group(2) or "").strip().lower()
        name = match.group(3).strip()

    return {
        "ingredient_name": name,
        "quantity": quantity,
        "unit": unit or "unit",
    }


def extract_ingredients_from_text(text: str) -> list[dict]:
    """Fallback: extract ingredients from unstructured text."""
    ingredients = []
    lines = text.split("\n")
    in_ingredient_section = False

    for line in lines:
        line = line.strip()
        lower = line.lower()

        if any(kw in lower for kw in ["bahan-bahan", "bahan bahan", "ingredients", "bahan:"]):
            in_ingredient_section = True
            continue

        if any(kw in lower for kw in ["cara", "method", "instructions", "langkah", "step"]):
            in_ingredient_section = False
            continue

        if in_ingredient_section and line and len(line) > 2 and len(line) < 100:
            # Clean up bullet points
            line = line.lstrip("•-–—*·● ")
            if line:
                parsed = parse_ingredient_string(line)
                ingredients.append(parsed)

    return ingredients


def extract_instructions_from_text(text: str) -> str:
    """Fallback: extract cooking instructions from unstructured text."""
    lines = text.split("\n")
    in_instructions = False
    steps = []

    for line in lines:
        line = line.strip()
        lower = line.lower()

        if any(kw in lower for kw in ["cara masak", "cara penyediaan", "method", "instructions", "langkah", "cara:"]):
            in_instructions = True
            continue

        if in_instructions and line and len(line) > 5:
            if any(kw in lower for kw in ["nota:", "tips:", "note:", "credit"]):
                break
            steps.append(line.lstrip("•-–—*·●1234567890. "))

    return "\n".join(f"{i+1}. {s}" for i, s in enumerate(steps) if s)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print(f"=== Boleh Masak Apa — Recipe Scraper ===")
    print(f"Time: {datetime.now(timezone.utc).isoformat()}")

    total = 0
    total += scrape_rasa_malaysia(max_pages=2)
    total += scrape_azie_kitchen(max_pages=2)

    print(f"\n=== Done! Added {total} new recipes ===")

    # Save scrape log for GitHub commit
    log = {
        "last_scrape": datetime.now(timezone.utc).isoformat(),
        "new_recipes": total,
    }
    os.makedirs("scraper", exist_ok=True)
    with open("scraper/last_scrape.json", "w") as f:
        json.dump(log, f, indent=2)

    print(f"Log saved to scraper/last_scrape.json")


if __name__ == "__main__":
    main()
