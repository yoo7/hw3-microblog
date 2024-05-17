"use strict";

const express = require("express");
const expressHandlebars = require("express-handlebars");
const session = require("express-session");
const canvas = require("canvas");
const fs = require("fs");

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
// 
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
    res.render("error");
});

// Additional routes that you must implement


app.get("/post/:id", (req, res) => {
    // TODO: Render post detail page
    const id = req.params.id;
});
app.post("/posts", (req, res) => {
    // Corresponds with the code that uses the form method in home.handlebars
    // TODO: Add a new post and redirect to home
    const title = req.body.title;
    const content = req.body.content;
    const user = req.session.userId;  // TODO not sure about what to put for user?

    addPost(title, content, user);
    res.redirect("/");
});
app.post("/like/:id", (req, res) => {
    // TODO: Update post likes
    updatePostLikes(req, res);
});
app.get("/profile", isAuthenticated, (req, res) => {
    // TODO: Render profile page
    // Using the middleware isAuthenticated, which executes before the actual route function
});
app.get("/avatar/:username", (req, res) => {
    // TODO: Serve the avatar image for the user
});
app.post("/register", (req, res) => {
    // TODO: Register a new user
    registerUser(req, res);  // TODO we just put here I guess?
});
app.post("/login", (req, res) => {
    // TODO: Login a user
    loginUser(req, res);
});
app.get("/logout", (req, res) => {
    // TODO: Logout the user
    logoutUser(req, res);
});
app.post("/delete/:id", isAuthenticated, (req, res) => {
    // TODO: Delete a post if the current user is the owner
    // TODO does it automatically call isAuthenticated??
    
    const id = req.params.id;

    if (id === req.session.userId) {
        // They are the owner of this id
        // TODO actually delete

    } else {
        // They're not the owner
        // TODO Error message
    }    
});

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
    { id: 1, title: "MIDTERM SEASON...", content: "Studying for my web dev midterm...", username: "StudiousStudent", timestamp: "2024-05-12 1:04", likes: 0 },
    { id: 2, title: "New pizza place", content: "new pizza place p good #notsponsored", username: "whatsyelp", timestamp: "2024-01-02 12:00", likes: 0 },
    { id: 3, title: "it be like dat", content: "The printer isn't working :(", username: "technologically-challenged", timestamp: "2024-03-24", likes: 0 },
];
let users = [
    { id: 1, username: "StudiousStudent", avatar_url: undefined, memberSince: "2024-01-01 08:00" },
    { id: 2, username: "whatsyelp", avatar_url: undefined, memberSince: "2024-01-02 09:00" },
    { id: 3, username: "technologically-challenged", avatar_url: undefined, memberSince: "2024-02-03 10:00"},
];
// TODO: add more posts and ids

let currUser = null;

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

// Function to add a new user
function addUser(username) {
    // Add new user object to the users array
    // TODO do we use the first unavailable ID number? Since you can delete users...
    const id = users[users.length - 1].id + 1;

    // TODO not sure how to do the time
    users[users.length] = { id: id, username: username, avatar_url: undefined, memberSince: "2024-01-01 10:00" };
}

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    console.log(req.session.userId);

    if (req.session.userId) {
        // Finished processing info, so move on to the actual route function
        next();
    } else {
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

        if (user.avatar_url === undefined) {
            handleAvatar(req, res);
            console.log(user.avatar_url);
        }

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
    // TODO: Fetch user posts and render the profile page
}

// Function to update post likes
function updatePostLikes(req, res) {
    // TODO: Increment post likes if conditions are met
    // TODO if this post isn't the current user's, then get the post obj and increment likes
    // TODO hopefully the number gets updated too on the screen but idk
    const id = req.params.id;
    res.send(id);  // TODO idk
    // TODO this id might be the post id! not user id
}

// Function to handle avatar generation and serving the user's avatar image
function handleAvatar(req, res) {
    const username = req.body.username;
    const user = findUserByUsername(username);
    
    user.avatar_url = generateAvatar(req.body.username[0]);
    console.log("username:", username);
    console.log("avatar_url:", user.avatar_url);
}

// Function to get the current user from session
function getCurrentUser(req) {
    // TODO: Return the user object if the session user ID matches

    // TODO check session user ID
    return req.session.userId;
}

// Function to get all posts, sorted by latest first
function getPosts() {
    return posts.slice().reverse();
}

// Function to add a new post
function addPost(title, content, user) {
    // TODO: Create a new post object and add to posts array
    // TODO placeholder for now, need to fix

    // TODO not sure how to do the time or the id
    posts[posts.length] =  { id: 4, title: title, content: content, username: user.username, timestamp: "2024-01-01 10:00", likes: 0 };

}

// Function to generate an image avatar
// Reference: https://blog.logrocket.com/creating-saving-images-node-canvas/
// and https://flaviocopes.com/canvas-node-generate-image/
function generateAvatar(letter, width = 100, height = 100) {
    // 1. Choose a color scheme based on the letter
    const color = "#FF927A";  // TODO: placeholder
    
    // 2. Create a canvas with specified dimensions
    const canvasImg = canvas.createCanvas(width, height);
    // Get a CanvasRenderingContext2D object
    const context = canvasImg.getContext("2d");
    

    // 3. Fill the entire rectangle (starting at (0, 0)) with the given color
    context.fillStyle = color;
    context.fillRect(0, 0, width, height);

    // 4. Draw the letter in the center
    context.fillText(letter, width / 2, height / 2);

    // 5. Return the avatar as a PNG buffer
    return canvasImg.toBuffer("images/png");
}