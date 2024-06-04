"use strict";

let allEmojis = [];  // Global list to hold all emojis

function toggleEmojiPanel() {
    const container = document.getElementById("emoji-container");
    container.style.display = container.style.display === "none" ? "block" : "none";

    if (container.style.display === "block" && allEmojis.length === 0) {
        // Fetch emojis, turn the response into JSON, update allEmojis, and display the toggle
        fetch("/emojis")
            .then(response => response.json())
            .then(data => {
                allEmojis = data;
                displayEmojis(allEmojis);
            })
            .catch(error => {
                console.error("Error fetching emojis:", error);
            });
    }
}

function displayEmojis(emojis,limit=200) {
    const container = document.getElementById("emoji-grid");
    container.innerHTML = '';  // Clear previous results

    if (Array.isArray(emojis) && emojis.length > 0) {
        emojis.slice(0, limit).forEach(emoji => {
            const emojiElement = document.createElement("span");
            emojiElement.textContent = emoji.character;
            emojiElement.title = emoji.slug;  // Showing the emoji name on hover
            emojiElement.style.cursor = "pointer";
            emojiElement.onclick = () => insertEmoji(emoji.character);
            container.appendChild(emojiElement);
        });
    } else {
        container.textContent = "No emojis found. Try a different search!";
    }
}

// Get the emojis whose names contain the substring searchTerm
function searchEmojis() {
    const searchTerm = document.getElementById("emoji-search").value.toLowerCase();

    // Look through the array of JS objects -- for each object, check the "slug" attribute
    // and see if that string contains the searchTerm
    const filteredEmojis = allEmojis.filter((obj) => obj.slug.includes(searchTerm));
    
    displayEmojis(filteredEmojis);
}

// Put emoji on the form
// Reference: https://stackoverflow.com/a/2345915
function insertEmoji(emoji) {
    const textarea = document.getElementById("content");

    textarea.focus();  // Keep focus on the textarea

    // Insert the emoji where the user cursor is
    const i = textarea.selectionStart;
    const firstSubstr = textarea.value.substring(0, i);
    const secondSubstr = textarea.value.substring(i);

    textarea.value = firstSubstr + emoji + secondSubstr;

    // Put the user cursor one after the emoji that was just inserted
    // Remember that emojis are not just one ASCII character
    textarea.focus();
    textarea.setSelectionRange(i + emoji.length, i + emoji.length);
}

function toggleDropdown() {
    const options = document.getElementsByClassName("options")[0];
    options.classList.toggle("visible");
}