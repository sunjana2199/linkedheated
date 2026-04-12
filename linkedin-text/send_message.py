# connect python with webdriver-chrome
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.keys import Keys
# import pyautogui as pag
from time import sleep
import pandas as pd
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select

from selenium.common.exceptions import NoSuchElementException    
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.action_chains import ActionChains

def main(useremail, userpassword):
    service = Service("linkedin-text//chromedriver")
    options = webdriver.ChromeOptions()
    # options.add_argument(f'user-agent={user_agent}')
    driver = webdriver.Chrome(service=service, options=options)

    # s=Service('chromedriver')
    # driver = webdriver.Chrome(service=s)
    url = "http://linkedin.com/"

            # path to driver web driver		
    driver.get(url)

    # Getting the login element
    username = driver.find_element(By.ID,"session_key")

    # Sending the keys for username	
    username.send_keys(useremail)

    sleep(2)

    # Getting the password element								
    password = driver.find_element(By.ID,"session_password")

    # Sending the keys for password
    password.send_keys(userpassword)

    sleep(2)

    # Go to messages section
    driver.get('http://linkedin.com/messaging/')
    sleep(2)

    # Filter only unread messages
    driver.get(driver.current_url + '?filter=unread')
    sleep(2)

    elements = driver.find_elements(By.XPATH, "//*[contains(@class, 'msg-conversations-container')]")

    # Check if we found any elements
    if elements:
        # Select the first element from the list
        first_element_with_XYZ = elements[0]
        first_element_with_XYZ.click()

if __name__ == "__main__":
    main()