
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
    const messageInputContainer = document.querySelector('div.msg-form__contenteditable');
    if (messageInputContainer && !document.getElementById('customRunPythonButton')) {
        const runPythonBtn = document.createElement('button');
        runPythonBtn.id = 'customRunPythonButton';
        runPythonBtn.textContent = 'Trigger AI clone';
        runPythonBtn.className = 'button-87';

        runPythonBtn.addEventListener('click', function() {
            // const messageContent = document.querySelector('.msg-s-event-listitem__body').textContent;

            const allMessages = document.querySelectorAll('.msg-s-event-listitem__body');
            const allProfiles = document.querySelectorAll('.msg-s-message-group__meta');

            const lastMessageContent2 = allMessages[allMessages.length - 1].textContent;
            // const lastMessageContent1 = allMessages[allMessages.length - 2].textContent;

            const lastProfileContent2 = allProfiles[allProfiles.length - 1].textContent;
            // const lastProfileContent1 = allProfiles[allProfiles.length - 2].textContent;

            const data = { 
                // profile1:lastProfileContent1, message1: lastMessageContent1,  
                profile2:lastProfileContent2, message2: lastMessageContent2
            };

            fetch('http://localhost:5000/run-python-script', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            })
            .then(response => response.text()) // Parse the response as text
            .then(text => {
                const messageInput = document.querySelector('div.msg-form__contenteditable');
                if (messageInput) {
                    const paragraph = document.createElement('p');
                    paragraph.textContent = text; // Set the text to the Python script's output
                    messageInput.appendChild(paragraph);

                    const event = new Event('input', { bubbles: true, cancelable: true });
                    messageInput.dispatchEvent(event);
                }
            })
            .catch(error => console.error('Error:', error));
        });

        const formContainer = document.querySelector('form.msg-form');
        if (formContainer) {
            formContainer.insertBefore(runPythonBtn, formContainer.firstChild);
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