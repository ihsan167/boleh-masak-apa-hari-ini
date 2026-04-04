"""
Boleh Masak Apa Hari Ini — Recipe Scraper
Fetches Malaysian recipes from TheMealDB API + recipe bank.
Saves raw content for LLM processing via Claude Code.
Runs daily via GitHub Actions.
"""

import os
import json
import random
import requests
from datetime import datetime, timezone

RAW_DIR = os.path.join(os.path.dirname(__file__), "raw")
PROCESSED_FILE = os.path.join(os.path.dirname(__file__), "processed.json")
BANK_FILE = os.path.join(os.path.dirname(__file__), "recipes_bank.json")

MEALDB_MALAYSIAN = "https://www.themealdb.com/api/json/v1/1/filter.php?a=Malaysian"
MEALDB_LOOKUP = "https://www.themealdb.com/api/json/v1/1/lookup.php?i="
RESIPIKITA_API = "https://www.resipikita.com/wp-json/wp/v2/resipi"


def load_processed() -> dict:
    if os.path.exists(PROCESSED_FILE):
        with open(PROCESSED_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_processed(data: dict):
    with open(PROCESSED_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def slugify(text: str) -> str:
    import re
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_]+', '-', text)
    return text[:80]


def save_raw(name: str, chef: str, source: str, image_url: str, raw_text: str) -> str | None:
    """Save raw recipe to file. Returns filename or None if exists."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    slug = slugify(name)
    filename = f"{today}_{slug}.json"
    filepath = os.path.join(RAW_DIR, filename)

    if os.path.exists(filepath):
        return None

    data = {
        "name": name,
        "chef": chef,
        "source": source,
        "image_url": image_url,
        "raw_text": raw_text,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
    }

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    processed = load_processed()
    processed[filename] = "pending"
    save_processed(processed)

    return filename


# ---------------------------------------------------------------------------
# Source 1: TheMealDB API
# ---------------------------------------------------------------------------

def fetch_mealdb_recipes() -> int:
    """Fetch Malaysian recipes from TheMealDB API."""
    print("\n=== Fetching from TheMealDB API ===")
    count = 0

    try:
        resp = requests.get(MEALDB_MALAYSIAN, timeout=10)
        meals = resp.json().get("meals") or []
    except Exception as e:
        print(f"  Error: {e}")
        return 0

    for meal in meals:
        meal_id = meal["idMeal"]
        name = meal["strMeal"]

        # Check if already saved (any date)
        processed = load_processed()
        already = any(slugify(name) in key for key in processed)
        if already:
            print(f"  Already saved: {name}")
            continue

        try:
            detail = requests.get(f"{MEALDB_LOOKUP}{meal_id}", timeout=10).json()
            m = detail["meals"][0]
        except Exception:
            continue

        # Build raw text with ingredients
        ingredients_text = ""
        for i in range(1, 21):
            ing = (m.get(f"strIngredient{i}") or "").strip()
            measure = (m.get(f"strMeasure{i}") or "").strip()
            if ing:
                ingredients_text += f"- {measure} {ing}\n"

        raw_text = f"""Recipe: {m['strMeal']}
Category: {m.get('strCategory', '')}
Origin: {m.get('strArea', '')}

INGREDIENTS:
{ingredients_text}
INSTRUCTIONS:
{m.get('strInstructions', '')}
"""

        image_url = m.get("strMealThumb", "")
        result = save_raw(name, "TheMealDB", f"themealdb.com/{meal_id}", image_url, raw_text)
        if result:
            count += 1
            print(f"  Saved: {name}")

    return count


# ---------------------------------------------------------------------------
# Source 2: Recipe Bank (curated Malaysian recipes)
# ---------------------------------------------------------------------------

def fetch_from_bank(count: int = 3) -> int:
    """Pick random unprocessed recipes from the recipe bank."""
    print("\n=== Picking from Recipe Bank ===")

    if not os.path.exists(BANK_FILE):
        print("  No recipe bank found. Skipping.")
        return 0

    with open(BANK_FILE, "r", encoding="utf-8") as f:
        bank = json.load(f)

    processed = load_processed()
    saved = 0

    # Find recipes not yet saved
    available = []
    for recipe in bank:
        slug = slugify(recipe["name"])
        already = any(slug in key for key in processed)
        if not already:
            available.append(recipe)

    if not available:
        print("  All recipes from bank already saved!")
        return 0

    # Pick random ones
    picks = random.sample(available, min(count, len(available)))

    for recipe in picks:
        raw_text = f"""Recipe: {recipe['name']}
Chef: {recipe.get('chef', 'Traditional')}

INGREDIENTS:
{recipe.get('ingredients_text', 'No ingredients listed.')}

INSTRUCTIONS:
{recipe.get('instructions_text', 'No instructions listed.')}
"""
        result = save_raw(
            recipe["name"],
            recipe.get("chef", "Traditional"),
            recipe.get("source", "Recipe Bank"),
            recipe.get("image_url", ""),
            raw_text,
        )
        if result:
            saved += 1
            print(f"  Saved: {recipe['name']}")

    return saved


# ---------------------------------------------------------------------------
# Source 3: ResepiKita WordPress API
# ---------------------------------------------------------------------------

def fetch_resipikita(count: int = 3) -> int:
    """Fetch random unprocessed recipes from ResepiKita API."""
    import re
    print("\n=== Fetching from ResepiKita API ===")

    import html as html_module

    def strip_html(text: str) -> str:
        return html_module.unescape(re.sub(r'<[^>]+>', '', text or '')).strip()

    try:
        resp = requests.get(
            RESIPIKITA_API,
            params={"per_page": 100, "_fields": "title,slug,meta"},
            timeout=15,
        )
        resp.raise_for_status()
        recipes = resp.json()
    except Exception as e:
        print(f"  Error: {e}")
        return 0

    processed = load_processed()

    available = []
    for recipe in recipes:
        meta = recipe.get("meta", {})
        name = strip_html(meta.get("nama-resipi") or recipe["title"]["rendered"])
        slug = slugify(name)
        already = any(slug in key for key in processed)
        if not already:
            available.append(recipe)

    if not available:
        print("  All ResepiKita recipes already saved!")
        return 0

    picks = random.sample(available, min(count, len(available)))
    saved = 0

    for recipe in picks:
        meta = recipe.get("meta", {})
        name = strip_html(meta.get("nama-resipi") or recipe["title"]["rendered"])

        # Extract ingredients
        ingredients_raw = meta.get("bahan-utama") or {}
        ingredients_lines = []
        for i in range(50):
            item = ingredients_raw.get(f"item-{i}")
            if item is None:
                break
            bahan = strip_html(item.get("bahan", ""))
            if bahan:
                ingredients_lines.append(f"- {bahan}")

        # Extract instructions
        steps_raw = meta.get("step-step-masak") or {}
        steps_lines = []
        for i in range(30):
            item = steps_raw.get(f"item-{i}")
            if item is None:
                break
            langkah = strip_html(item.get("langkah", ""))
            if langkah:
                steps_lines.append(f"{i + 1}. {langkah}")

        raw_text = (
            f"Recipe: {name}\n"
            f"Chef: Khairul Aming\n\n"
            f"INGREDIENTS:\n"
            f"{chr(10).join(ingredients_lines)}\n\n"
            f"INSTRUCTIONS:\n"
            f"{chr(10).join(steps_lines)}\n"
        )

        result = save_raw(
            name,
            "Khairul Aming",
            f"resipikita.com/{recipe.get('slug', slugify(name))}",
            "",
            raw_text,
        )
        if result:
            saved += 1
            print(f"  Saved: {name}")

    return saved


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print(f"=== Boleh Masak Apa — Recipe Scraper ===")
    print(f"Time: {datetime.now(timezone.utc).isoformat()}")

    os.makedirs(RAW_DIR, exist_ok=True)

    total = 0
    total += fetch_mealdb_recipes()
    total += fetch_from_bank(count=3)
    total += fetch_resipikita(count=3)

    processed = load_processed()
    pending = sum(1 for v in processed.values() if v == "pending")
    done = sum(1 for v in processed.values() if v == "done")

    print(f"\n=== Done! ===")
    print(f"  New files saved: {total}")
    print(f"  Total pending: {pending}")
    print(f"  Total processed: {done}")

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
