
const css = `
.button-87 {
  margin: 10px;
  padding: 15px 30px;
  text-align: center;
  text-transform: uppercase;
  transition: 0.5s;
  background-size: 200% auto;
  color: white;
  border-radius: 10px;
  display: block;
  border: 0px;
  font-weight: 700;
  box-shadow: 0px 0px 14px -7px #f09819;
  background-image: linear-gradient(45deg, #FF512F 0%, #F09819  51%, #FF512F  100%);
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;
}

.button-87:hover {
  background-position: right center;
  color: #fff;
  text-decoration: none;
}

.button-87:active {
  transform: scale(0.95);
}
`;

const style = document.createElement('style');
style.type = 'text/css';
style.appendChild(document.createTextNode(css));
(document.head || document.documentElement).appendChild(style);

function insertRunPythonButton() {
    const messageInputContainer = document.querySelector('div.msg-form__contenteditable'); // Adjust the selector as needed
    // Check if the message input container exists and the button has not been added yet
    if (messageInputContainer && !document.getElementById('customRunPythonButton')) {
        const runPythonBtn = document.createElement('button');
        runPythonBtn.id = 'customRunPythonButton';
        runPythonBtn.textContent = 'Run Python'; // Set the button text
        runPythonBtn.className = 'button-87'; // Assign the custom CSS class for styling

        // Event listener for button click
        runPythonBtn.addEventListener('click', function() {
            // Fetch call to the Python script execution endpoint
            fetch('http://localhost:5000/run-python-script')
                .then(response => response.text()) // Parse the response as text
                .then((text) => {
                    // Find the message input container again to ensure it's still accessible
                    const messageInput = document.querySelector('div.msg-form__contenteditable');
                    if (messageInput) {
                        // Create a new paragraph element to display the script's output
                        const paragraph = document.createElement('p');
                        paragraph.textContent = text; // Set the text to the Python script's output
                        messageInput.appendChild(paragraph); // Append the paragraph to the message input container

                        // Dispatch an input event to simulate user typing, triggering any attached event listeners
                        const event = new Event('input', { bubbles: true, cancelable: true });
                        messageInput.dispatchEvent(event);
                    }
                })
                .catch(error => console.error('Error running Python script:', error)); // Log errors to the console
        });

        // Find the form container to insert the button as its first child
        const formContainer = document.querySelector('form.msg-form'); // Adjust the selector as needed
        if (formContainer) {
            formContainer.insertBefore(runPythonBtn, formContainer.firstChild); // Insert the button
        }
    }
}


// Observer to monitor DOM changes
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.addedNodes.length) {
            insertRunPythonButton();
        }
    });
});

// Configuration for the observer (which mutations to observe)
const config = { childList: true, subtree: true };

// Start observing the target node for configured mutations
const targetNode = document.body; // Observe the entire body for any DOM changes
observer.observe(targetNode, config);

// Remember to disconnect the observer when it's no longer needed to prevent memory leaks
// observer.disconnect();