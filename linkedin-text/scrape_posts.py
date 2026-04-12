"""
LinkedIn Post Scraper
Scrapes your own posts from the past 365 days including:
- Post link
- Date posted
- Likes count
- Comments count
- Impressions (from View Analytics panel)

Usage (no login needed if already signed in to Chrome):
    python scrape_posts.py --username YOUR_LINKEDIN_USERNAME

Usage (with credentials):
    python scrape_posts.py --username YOUR_LINKEDIN_USERNAME --email YOUR_EMAIL --password YOUR_PASSWORD

Output: linkedin_posts.csv
"""

import argparse
import csv
import re
import time
from datetime import datetime, timedelta

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import (
    NoSuchElementException,
    TimeoutException,
    StaleElementReferenceException,
)


CUTOFF_DATE = datetime.now() - timedelta(days=365)
OUTPUT_FILE = "linkedin_posts.csv"
CHROMEDRIVER_PATH = "linkedin-text/chromedriver"


def login(driver, email, password):
    driver.get("https://www.linkedin.com/login")
    wait = WebDriverWait(driver, 15)

    wait.until(EC.presence_of_element_located((By.ID, "username"))).send_keys(email)
    driver.find_element(By.ID, "password").send_keys(password)
    driver.find_element(By.XPATH, "//button[@type='submit']").click()

    # Wait for home feed to confirm login
    wait.until(EC.url_contains("feed"))
    print("[+] Logged in successfully")
    time.sleep(2)


def parse_relative_date(text):
    """
    Convert LinkedIn's relative date strings to a datetime.
    Examples: '2d', '1w', '3mo', '1yr', 'Just now', '5h'
    Returns None if the post is older than 365 days.
    """
    text = text.strip().lower()
    now = datetime.now()

    if "just now" in text or "now" in text:
        return now

    match = re.search(r"(\d+)\s*(s|m|h|d|w|mo|yr)", text)
    if not match:
        return None

    amount = int(match.group(1))
    unit = match.group(2)

    if unit == "s":
        return now - timedelta(seconds=amount)
    elif unit == "m":
        return now - timedelta(minutes=amount)
    elif unit == "h":
        return now - timedelta(hours=amount)
    elif unit == "d":
        return now - timedelta(days=amount)
    elif unit == "w":
        return now - timedelta(weeks=amount)
    elif unit == "mo":
        return now - timedelta(days=amount * 30)
    elif unit == "yr":
        return now - timedelta(days=amount * 365)

    return None


def parse_count(text):
    """Parse '1,234' or '1.2K' or '34' into an integer."""
    text = text.strip().replace(",", "")
    if not text or text == "–":
        return 0
    try:
        if text.lower().endswith("k"):
            return int(float(text[:-1]) * 1000)
        return int(text)
    except ValueError:
        return 0


def scroll_to_load_more(driver):
    last_height = driver.execute_script("return document.body.scrollHeight")
    driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
    time.sleep(3)
    new_height = driver.execute_script("return document.body.scrollHeight")
    return new_height != last_height  # Returns False when no more content loaded


def get_impressions(driver, post_element):
    """Click 'View analytics' on a post and read the impressions count."""
    impressions = 0
    try:
        # LinkedIn shows analytics button on your own posts
        analytics_btn = post_element.find_element(
            By.XPATH,
            ".//button[contains(@aria-label, 'analytics') or contains(., 'View analytics')]"
            "|.//span[contains(text(),'analytics')]/..",
        )
        driver.execute_script("arguments[0].scrollIntoView(true);", analytics_btn)
        time.sleep(0.5)
        analytics_btn.click()
        time.sleep(2)

        # The analytics panel/modal appears — look for impressions value
        wait = WebDriverWait(driver, 8)

        # Try the analytics overlay panel
        selectors = [
            "//span[contains(text(),'impression') or contains(text(),'Impression')]/preceding-sibling::span",
            "//dt[contains(text(),'Impression')]/following-sibling::dd",
            "//*[contains(@class,'analytics')]//strong",
            "//span[@data-test-analytics-metric-value]",
        ]
        for sel in selectors:
            try:
                el = wait.until(EC.presence_of_element_located((By.XPATH, sel)))
                impressions = parse_count(el.text)
                if impressions:
                    break
            except TimeoutException:
                continue

        # Close the analytics panel
        try:
            close_btn = driver.find_element(
                By.XPATH,
                "//button[@aria-label='Dismiss' or @aria-label='Close' or contains(@class,'dismiss')]",
            )
            close_btn.click()
            time.sleep(1)
        except NoSuchElementException:
            # Press Escape as fallback
            from selenium.webdriver.common.keys import Keys
            driver.find_element(By.TAG_NAME, "body").send_keys(Keys.ESCAPE)
            time.sleep(1)

    except NoSuchElementException:
        pass  # No analytics button found (not your post, or unavailable)

    return impressions


def scrape_posts(driver, username):
    url = f"https://www.linkedin.com/in/{username}/recent-activity/all/"
    driver.get(url)
    time.sleep(3)

    posts_data = []
    seen_urls = set()
    stop_scraping = False

    print(f"[+] Scraping posts from: {url}")

    while not stop_scraping:
        # Find all post containers currently loaded
        post_containers = driver.find_elements(
            By.XPATH,
            "//div[contains(@class,'feed-shared-update-v2') or contains(@class,'occludable-update')]",
        )

        for container in post_containers:
            try:
                # --- Post URL & Date ---
                # LinkedIn puts the post date in a time/span with a relative string
                # The permalink is on the timestamp anchor tag
                try:
                    time_link = container.find_element(
                        By.XPATH,
                        ".//a[contains(@href,'/feed/update/') or contains(@href,'activity')]",
                    )
                    post_url = time_link.get_attribute("href").split("?")[0]
                except NoSuchElementException:
                    post_url = ""

                if post_url in seen_urls:
                    continue

                # Date text — LinkedIn shows "2d", "1w", "3mo" etc.
                try:
                    date_el = container.find_element(
                        By.XPATH,
                        ".//span[contains(@class,'update-components-actor__sub-description')]"
                        "|.//span[contains(@class,'visually-hidden') and (contains(text(),'ago') or contains(text(),'now'))]"
                        "|.//a[contains(@href,'activity')]/span[@aria-hidden='true']",
                    )
                    date_text = date_el.text.strip()
                except NoSuchElementException:
                    date_text = ""

                post_date = parse_relative_date(date_text) if date_text else None

                # Stop if post is older than 365 days
                if post_date and post_date < CUTOFF_DATE:
                    print(f"[!] Reached post older than 365 days — stopping.")
                    stop_scraping = True
                    break

                # --- Likes ---
                likes = 0
                try:
                    likes_el = container.find_element(
                        By.XPATH,
                        ".//span[contains(@class,'social-details-social-counts__reactions-count')]"
                        "|.//button[contains(@aria-label,'reaction')]//span"
                        "|.//span[contains(@aria-label,'like')]",
                    )
                    likes = parse_count(likes_el.text)
                except NoSuchElementException:
                    pass

                # --- Comments ---
                comments = 0
                try:
                    comments_el = container.find_element(
                        By.XPATH,
                        ".//button[contains(@aria-label,'comment')]//span"
                        "|.//span[contains(@class,'social-details-social-counts__comments')]"
                        "|.//li[contains(@class,'social-details-social-counts__item')][2]//span",
                    )
                    comments = parse_count(comments_el.text)
                except NoSuchElementException:
                    pass

                # --- Impressions (requires clicking analytics) ---
                impressions = get_impressions(driver, container)

                # --- Date formatting ---
                date_str = post_date.strftime("%Y-%m-%d") if post_date else date_text

                record = {
                    "date": date_str,
                    "post_url": post_url,
                    "likes": likes,
                    "comments": comments,
                    "impressions": impressions,
                }

                seen_urls.add(post_url)
                posts_data.append(record)

                print(
                    f"  [{len(posts_data)}] {date_str} | "
                    f"Likes: {likes} | Comments: {comments} | "
                    f"Impressions: {impressions} | {post_url[:60]}..."
                )

            except StaleElementReferenceException:
                continue

        if stop_scraping:
            break

        # Scroll to load more posts
        did_scroll = scroll_to_load_more(driver)
        if not did_scroll:
            print("[+] No more posts to load.")
            break

    return posts_data


def save_to_csv(posts_data, filepath):
    if not posts_data:
        print("[!] No posts found.")
        return

    fieldnames = ["date", "post_url", "likes", "comments", "impressions"]
    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(posts_data)

    print(f"\n[+] Saved {len(posts_data)} posts to {filepath}")


def get_chrome_profile_path():
    """Return the default Chrome user data directory for macOS."""
    import os
    return os.path.expanduser("~/Library/Application Support/Google/Chrome")


def main():
    parser = argparse.ArgumentParser(description="Scrape your LinkedIn posts analytics")
    parser.add_argument("--username", required=True, help="Your LinkedIn username (from profile URL)")
    parser.add_argument("--email", default=None, help="LinkedIn email (only needed if not already logged in)")
    parser.add_argument("--password", default=None, help="LinkedIn password (only needed if not already logged in)")
    parser.add_argument("--output", default=OUTPUT_FILE, help=f"Output CSV path (default: {OUTPUT_FILE})")
    parser.add_argument("--no-profile", action="store_true", help="Don't use existing Chrome profile (open fresh browser)")
    args = parser.parse_args()

    service = Service(CHROMEDRIVER_PATH)
    options = webdriver.ChromeOptions()
    options.add_argument("--start-maximized")

    if not args.no_profile:
        # Reuse existing Chrome profile so you stay logged in
        options.add_argument(f"--user-data-dir={get_chrome_profile_path()}")
        options.add_argument("--profile-directory=Default")
        print("[+] Using existing Chrome profile (no login needed if already signed in)")

    driver = webdriver.Chrome(service=service, options=options)

    try:
        # Only log in if credentials provided and not using existing profile
        if args.email and args.password:
            login(driver, args.email, args.password)
        else:
            driver.get("https://www.linkedin.com/feed/")
            time.sleep(3)
            if "login" in driver.current_url or "authwall" in driver.current_url:
                print("[!] Not logged in. Re-run with --email and --password, or log into Chrome first.")
                driver.quit()
                return

        posts = scrape_posts(driver, args.username)
        save_to_csv(posts, args.output)
    finally:
        driver.quit()


if __name__ == "__main__":
    main()
