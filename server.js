"use strict";

const express = require("express");
const expressHandlebars = require("express-handlebars");
const session = require("express-session");
const canvas = require("canvas");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const { google } = require("googleapis");
const { OAuth2Client } = require("google-auth-library");

const API_KEY = process.env.API_KEY;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:3000/auth/google/callback";
const client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Configuration and Setup
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

const app = express();
const PORT = 3000;

/*
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    Handlebars Helpers

    Handlebars helpers are custom functions that can be used within the templates 
    to perform specific tasks. They enhance the functionality of templates and 
    help simplify data manipulation directly within the view files.

    In this project, two helpers are provided:
    
    1. toLowerCase:
       - Converts a given string to lowercase.
       - Usage example: {{toLowerCase "SAMPLE STRING"}} -> "sample string"

    2. ifCond:
       - Compares two values for equality and returns a block of content based on 
         the comparison result.
       - Usage example: 
            {{#ifCond value1 value2}}
                <!-- Content if value1 equals value2 -->
            {{else}}
                <!-- Content if value1 does not equal value2 -->
            {{/ifCond}}
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
*/

// Set up Handlebars view engine with custom helpers
//
app.engine(
    "handlebars",
    expressHandlebars.engine({
        helpers: {
            toLowerCase: function (str) {
                return str.toLowerCase();
            },
            ifCond: function (v1, v2, options) {
                if (v1 === v2) {
                    return options.fn(this);
                }
                return options.inverse(this);
            },
        },
    })
);

app.set("view engine", "handlebars");
app.set("views", "./views");

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Middleware
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app.use(
    session({
        secret: "oneringtorulethemall",     // Secret key to sign the session ID cookie
        resave: false,                      // Don't save session if unmodified
        saveUninitialized: false,           // Don't create session until something stored
        cookie: { secure: false },          // True if using https. Set to false for development without https
    })
);

// Replace any of these variables below with constants for your application. These variables
// should be used in your template files. 
app.use((req, res, next) => {
    res.locals.appName = "Whiteboard";
    res.locals.copyrightYear = 2024;
    res.locals.postNeoType = "Note";
    res.locals.loggedIn = req.session.loggedIn || false;
    res.locals.userId = req.session.userId || "";
    next();
});

app.use(express.static("public"));                  // Serve static files
app.use(express.urlencoded({ extended: true }));    // Parse URL-encoded bodies (as sent by HTML forms)
app.use(express.json());                            // Parse JSON bodies (as sent by API clients)

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Routes
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// Home route: render home view with posts and user
// We pass the posts and user variables into the home
// template
//
app.get("/", (req, res) => {
    const posts = getPosts();
    const user = getCurrentUser(req) || {};

    // Use home.handlebars
    res.render("home", { posts, user });
});

// Register GET route is used for error response from registration
//
app.get("/register", (req, res) => {
    // Error message is whatever the query string value is
    res.render("loginRegister", { regError: req.query.error });
});

// Login route GET route is used for error response from login
//
app.get("/login", (req, res) => {
    // Error message is whatever the query string value is
    res.render("loginRegister", { loginError: req.query.error });
});

// Error route: render error page
//
app.get("/error", (req, res) => {
    const user = getCurrentUser(req);
    
    res.render("error", { user: user });
});

// Additional routes that you must implement

app.post("/posts", isAuthenticated, (req, res) => {
    // Add new post and redirect to home
    // Corresponds with the code that uses the form method in home.handlebars
    const title = req.body.title;
    const content = req.body.content;
    const user = findUserById(req.session.userId);

    addPost(title, content, user);
    res.redirect("/");
});
app.post("/like/:id", isAuthenticated, (req, res) => {
    // Update post likes
    updatePostLikes(req, res);
});
app.get("/profile", isAuthenticated, (req, res) => {
    // Using the middleware isAuthenticated, which executes before the actual route function
    renderProfile(req, res);
});
app.get("/avatar/:username", (req, res) => {
    // Serve the avatar image for the user
    const username = req.params.username;

    // Send the image back as a response
    res.sendFile(path.join(__dirname, username));
});
app.post("/register", (req, res) => {
    // Register a new user
    registerUser(req, res)
});
app.post("/login", (req, res) => {
    // Login a user
    loginUser(req, res);
});
app.get("/logout", isAuthenticated, (req, res) => {
    logoutUser(req, res);
});
app.post("/delete/:id", isAuthenticated, (req, res) => {
    // Delete a post if the current user is the owner
    
    // Uses requesting post's username to crosscheck with current logged in user
    const postOwner = req.params.username;

    // Also takes the postId from req
    const postId = req.params.id;

    // Find the matching postid, then check if the 
    // post writer is same as current writer. 
    // If so, actually delete the post by splicing posts[id] out of array
    if (postOwner === req.session.username) {
        // They are the owner of this id
        posts.splice(postId - 1, 1);
    } else {
        // They're not the owner
        res.redirect("/error");
    }    
});
app.get("/emojis", (req, res) => {
    // Code from 5/17/24 lecture from Dr. Posnett

    // If emojis.json doesn't exist, fetch it
    if (!fs.existsSync(path.join(__dirname, "emojis.json"))) {
        const url = `https://emoji-api.com/emojis?access_key=${API_KEY}`;

        // Get the emojis, THEN send emojis
        fetch(url)
            .then(response => response.json())
            .then(data => fs.writeFile("emojis.json", JSON.stringify(data), (error) => error && console.error("Error fetching emojis:", error)))
            .then(data => sendEmojis(req, res))
            .catch(error => {
                console.error("Error fetching emojis:", error);
            });
    } else {
        // File already exists, so directly send the emojis
        sendEmojis(req, res);
    }
});
app.get("/auth/google", (req, res) => {
    // Code from 5/22 discussion with Zeerak
    // Want user email and profile
    const url = client.generateAuthUrl({
        access_type: "offline",
        scope: ["https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"],
    });

    // Go to the callback function
    // Once Google verifies authorization, it goes to the callback function below
    res.redirect(url);
});
app.get("/auth/google/callback", async (req, res) => {
    // Code from 5/22 discussion with Zeerak
    const { code } = req.query;
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const oauth2 = google.oauth2({
        auth: client,
        version: "v2",
    });

    const userinfo = await oauth2.userinfo.get();
    
    res.send(`
        <h1>Hello, ${userinfo.data.name}</h1>
        <p>Email: ${userinfo.data.email}</p>
        <img src="${userinfo.data.picture}" alt="Profile PIcture">
        <br>
        <a href="/logout">Logout from App</a>
        <br>
    `);
});

// ahref /auth/google

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Server Activation
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Support Functions and Variables
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// Example data for posts and users
let posts = [
    { id: 1, title: "New pizza place", content: "new pizza place p good #notsponsored", username: "whatsyelp", timestamp: "1/2/2024, 1:32 PM", likes: 0 },
    { id: 2, title: "it be like dat", content: "The printer isn't working :(", username: "technologically-challenged", timestamp: "3/24/2024, 5:31 PM", likes: 0 },
    { id: 3, title: "MIDTERM SEASON...", content: "Studying for my web dev midterm...", username: "SuperStudious", timestamp: "4/29/2024, 1:04 AM", likes: 0 },
];
let users = [
    { id: 1, username: "whatsyelp", avatar_url: undefined, memberSince: "12/17/2023, 10:11 AM" },
    { id: 2, username: "technologically-challenged", avatar_url: undefined, memberSince: "2/3/2024, 8:34 PM" },
    { id: 3, username: "SuperStudious", avatar_url: undefined, memberSince: "3/2/2024, 3:12 PM" },
];

// Function to find a user by username
function findUserByUsername(username) {
    // Return user object if exists, otherwise return undefined
    // For each user in users, check if the username matches the given one
    return users.find(user => user.username === username);
}

// Function to find a user by user ID
function findUserById(userId) {
    // Return user object if found, otherwise return undefined
    return users.find(user => user.id === userId);
}

// Function to find posts by user ID
function findPostsByUser(username) {
    return posts.filter((post) => post.username === username);
}

// Function to find a post by the postId
function findPostById(postId) {
    // Turn the id from string to number
    const id = parseInt(postId);
    return posts.find(post => post.id === id);
}

// Function to get current time and return as string
function getCurrTime() {
    const date = new Date();
    return date.toLocaleTimeString([], {year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit"});
}

// Function to add a new user to the users array
function addUser(username) {
    // Use first unavailable ID number
    const id = users[users.length - 1].id + 1;

    users[users.length] = { id: id, username: username, avatar_url: undefined, memberSince: getCurrTime() };
}

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    // console.log(req.session.userId);

    if (req.session.userId) {
        // Finished processing info, so move on to the actual route function
        next();
    } else {
        console.log("Redirecting to login...");
        res.redirect("/login");
    }
}

// Function to register a user
function registerUser(req, res) {
    const user = findUserByUsername(req.body.username);

    if (!user) {
        // Username doesn't exist, so we can register new user and redirect appropriately
        addUser(req.body.username);
        handleAvatar(req, res);
        res.redirect("/login");
    } else {
        // User already exists, so redirect to /register GET endpoint with these parameters
        res.redirect("/register?error=Username+already+exists");
    }    
}

// Function to login a user
function loginUser(req, res) {
    const user = findUserByUsername(req.body.username);

    // User exists
    if (user) {
        // Login user and redirect
        req.session.userId = user.id;
        req.session.loggedIn = true;

        res.redirect("/");
    } else {
        // Redirect to the /login GET endpoint with these parameters
        res.redirect("/login?error=Invalid+username");
    }
}

// Function to logout a user
// Code from 5/17 lecture from Dr. Posnett
function logoutUser(req, res) {
    // Destroy session and redirect appropriately
    req.session.destroy(err => {
        if (err) {
            console.error("Error destroying session:", err);
            res.redirect("/error");
        } else {
            // Successful logout
            res.redirect("/");
        }
    });
}

// Function to render the profile page
function renderProfile(req, res) {
    // Fetch user posts and render the profile page
    const user = getCurrentUser(req);
    const usersPosts = findPostsByUser(user.username).reverse();
    
    res.render("profile", { posts: usersPosts, user: user })
}

// Function to update post likes
function updatePostLikes(req, res) {
    // Don't let user like the post if not logged in
    if (!req.session.userId) {
        res.redirect("/login");
    }

    const postId = req.params.id;
    const post = findPostById(postId);

    // User is (un)liking a post that isn't theirs
    if (findUserByUsername(post.username) !== req.session.userId) {
        const likeUp = req.body.likeUp;

        if (likeUp === "true") {
            post.likes++;
        } else {
            post.likes--;
        }

        res.send("" + post.likes);
    }
}

// Send the emojis to user
// Code from 5/17/24 lecture from Dr. Posnett
function sendEmojis(req, res) {
    const emojisPath = path.join(__dirname, "emojis.json");

    fs.readFile(emojisPath, "utf8", (err, data) => {
        if (err) {
            console.error("Error reading emoji file:", err);
            res.status(500).json({ error: "Failed to load emojis." });
        } else {
            res.setHeader("Content-Type", "application/json");
            res.send(data);
        }
    })
}

// Function to handle avatar generation and serving the user's avatar image
function handleAvatar(req, res) {
    const username = req.body.username;
    const user = findUserByUsername(username);

    if (username) {
        const buffer = generateAvatar(username[0]);
        const url = `public/images/${username}`;

        user.avatar_url = `/images/${username}`;
        fs.writeFileSync(url, buffer);
    }
}

// Function to get the current user from session
function getCurrentUser(req) {
    // Return the user object if the session user ID matches
    return findUserById(req.session.userId);
}

// Function to get all posts, sorted by latest first
function getPosts() {
    return posts.slice().reverse();
}

// Function to add a new post
function addPost(title, content, user) {
    // Find the smallest id number that hasn't been taken and update the list
    // If all ids are used, then add the post at posts[posts.length]
    for (let i = 0; i <= posts.length; i++) {
        if (posts[i] === undefined) {
            posts[i] = { id: i + 1, title: title, content: content, username: user.username, timestamp: getCurrTime(), likes: 0 };
            return;
        }
    }
}

// Function to generate an image avatar
// Reference: https://blog.logrocket.com/creating-saving-images-node-canvas/
// and https://flaviocopes.com/canvas-node-generate-image/
function generateAvatar(letter, width = 100, height = 100) {
    // Write the letter with the same font we'll used in other parts of the site
    const fontPath = path.join(__dirname, "/public/css/Gaegu/Gaegu-Regular.ttf");
    canvas.registerFont(fontPath, { family: "Gaegu", weight: "400", style: "normal"});
    
    // 1. Choose a color scheme based on the letter
    // There are 16777216 possible RGB color variations (pick from 0 to 16777215)
    // toString(16) gives hex value
    const color = "#" + Math.floor(Math.random() * 16777215).toString(16);
        
    // 2. Create a canvas with specified dimensions
    const canvasImg = canvas.createCanvas(width, height);

    // Get a CanvasRenderingContext2D object
    const context = canvasImg.getContext("2d");

    // 3. Fill the entire rectangle (starting at (0, 0)) with the given color
    context.fillStyle = color;
    context.fillRect(0, 0, width, height);

    // 4. Draw the letter in the center
    context.font = "80px 'Gaegu' sans-serif";
    const textHeight = context.measureText(letter).emHeightAscent;

    // Pick a certain height based on whether letter is uppercase or not (to help center the letter)
    let useHeight = textHeight / 4;

    if (letter === letter.toUpperCase()) {
        useHeight = parseInt(context.font) / 4;
    }

    context.textAlign = "center";
    context.textBaseLine = "middle";
    context.fillStyle = "white";

    context.fillText(letter, width / 2, height / 2 + useHeight);

    // 5. Return the avatar as a PNG buffer
    return canvasImg.toBuffer("image/png");
}
