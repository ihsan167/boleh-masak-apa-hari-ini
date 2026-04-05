"""
Insert pending recipes from raw/ into Supabase.
Run: python scraper/insert_recipes.py
"""
import os
import json
import re
import html
import requests
from datetime import datetime, timezone

RAW_DIR = os.path.join(os.path.dirname(__file__), "raw")
PROCESSED_FILE = os.path.join(os.path.dirname(__file__), "processed.json")

# Read from environment variables first (GitHub Actions), fallback to .env
def _load_env_file():
    env = {}
    ENV_FILE = os.path.join(os.path.dirname(__file__), "..", ".env")
    if os.path.exists(ENV_FILE):
        with open(ENV_FILE) as f:
            for line in f:
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    k, v = line.split("=", 1)
                    env[k.strip()] = v.strip()
    return env

_env_file = _load_env_file()
SUPABASE_URL = os.environ.get("SUPABASE_URL") or _env_file.get("EXPO_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY") or _env_file.get("EXPO_PUBLIC_SUPABASE_ANON_KEY", "")

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}


def load_processed():
    if os.path.exists(PROCESSED_FILE):
        with open(PROCESSED_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_processed(data):
    with open(PROCESSED_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def parse_ingredient(line):
    """Parse '- 2 cawan tepung' → (name, quantity, unit)."""
    line = re.sub(r'\s*\(.*?\)', '', line.lstrip("- ").strip())  # remove notes in ()
    line = html.unescape(line)

    # Match: optional number (including fractions like 1/2, 1 1/2) + optional unit + rest
    m = re.match(
        r'^(\d+\s+\d+/\d+|\d+/\d+|\d+\.?\d*)\s*([a-zA-Z]+)?\s+(.*)',
        line, re.IGNORECASE
    )
    if m:
        qty_str, unit, name = m.groups()
        # Handle mixed numbers like "1 1/2"
        parts = qty_str.strip().split()
        if len(parts) == 2:
            whole, frac = parts
            num, den = frac.split('/')
            qty = float(whole) + float(num) / float(den)
        elif '/' in qty_str:
            num, den = qty_str.split('/')
            qty = float(num) / float(den)
        else:
            qty = float(qty_str)
        unit = (unit or "").lower()
        name = name.strip()
        return name, round(qty, 2), unit

    # No number — full line is the name
    return line.strip(), 0.0, ""


def extract_ingredients(raw_text):
    """Extract ingredient lines from raw_text."""
    in_ingredients = False
    ingredients = []
    for line in raw_text.splitlines():
        stripped = line.strip()
        if "INGREDIENTS:" in stripped:
            in_ingredients = True
            continue
        if "INSTRUCTIONS:" in stripped:
            break
        if in_ingredients and stripped.startswith("-"):
            ingredients.append(stripped)
    return ingredients


def extract_instructions(raw_text):
    """Extract instructions section from raw_text."""
    lines = []
    in_instructions = False
    for line in raw_text.splitlines():
        if "INSTRUCTIONS:" in line:
            in_instructions = True
            continue
        if in_instructions:
            lines.append(line)
    return "\n".join(lines).strip()


def insert_recipe(raw):
    """Insert one recipe + its ingredients to Supabase. Returns recipe id or None."""
    name = html.unescape(raw["name"])
    raw_text = raw.get("raw_text", "")
    instructions = extract_instructions(raw_text)
    ingredient_lines = extract_ingredients(raw_text)

    recipe_payload = {
        "name": name,
        "chef": raw.get("chef", "Traditional"),
        "source_url": raw.get("source", ""),
        "image_url": raw.get("image_url", ""),
        "instructions": instructions,
        "servings": 4,
    }

    # Insert recipe
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/recipes",
        headers=HEADERS,
        json=recipe_payload,
        timeout=10,
    )

    if resp.status_code not in (200, 201):
        print(f"  ERROR inserting recipe: {resp.status_code} {resp.text}")
        return None

    recipe_id = resp.json()[0]["id"]

    # Insert ingredients
    ingredients_payload = []
    for line in ingredient_lines:
        ing_name, qty, unit = parse_ingredient(line)
        if not ing_name:
            continue
        ingredients_payload.append({
            "recipe_id": recipe_id,
            "ingredient_name": ing_name,
            "quantity": qty,
            "unit": unit,
        })

    if ingredients_payload:
        resp2 = requests.post(
            f"{SUPABASE_URL}/rest/v1/recipe_ingredients",
            headers=HEADERS,
            json=ingredients_payload,
            timeout=10,
        )
        if resp2.status_code not in (200, 201):
            print(f"  WARNING: ingredients insert failed: {resp2.status_code} {resp2.text}")

    return recipe_id


def main():
    print("=== Inserting Pending Recipes to Supabase ===")
    processed = load_processed()
    pending = {k: v for k, v in processed.items() if v == "pending"}

    if not pending:
        print("No pending recipes.")
        return

    print(f"Found {len(pending)} pending recipes.\n")

    for filename in list(pending.keys()):
        filepath = os.path.join(RAW_DIR, filename)
        if not os.path.exists(filepath):
            print(f"  SKIP (file not found): {filename}")
            continue

        with open(filepath, "r", encoding="utf-8") as f:
            raw = json.load(f)

        name = html.unescape(raw["name"])
        print(f"Processing: {name}")
        recipe_id = insert_recipe(raw)

        if recipe_id:
            processed[filename] = "done"
            save_processed(processed)
            print(f"  OK Inserted (id: {recipe_id})")
        else:
            print(f"  FAILED")

    done = sum(1 for v in processed.values() if v == "done")
    still_pending = sum(1 for v in processed.values() if v == "pending")
    print(f"\nDone! {done} total in DB, {still_pending} still pending.")


if __name__ == "__main__":
    main()
