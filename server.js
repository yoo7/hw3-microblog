"use strict";

const express = require("express");
const expressHandlebars = require("express-handlebars");
const session = require("express-session");

const canvas = require("canvas");
const fs = require("fs");
const path = require("path");

require("dotenv").config();

const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;

const sqlite3 = require("sqlite3");
const sqlite = require("sqlite");

const crypto = require("crypto");

const API_KEY = process.env.API_KEY;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

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
            alreadyLiked: function (likedBy, username) {
                if (username === undefined) {
                    return false;
                }

                if (likedBy === null || likedBy === undefined || likedBy === "" || !likedBy.includes(username)) {
                    return false;
                }

                return true;
            },
            formatTimestamp: function(timestamp) {
                // Return nicely formatted string for the timestamp
                const date = new Date(timestamp);
                return date.toLocaleTimeString([], {year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit"});
            },
            notFramed: function(post) {
                // Returns true if there is a timer id for this post (this post hasn't been framed yet)
                return (timerIdDictionary.get(post.id) !== undefined);
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

// Configure passport
passport.use(new GoogleStrategy({
    clientID: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    callbackURL: `http://localhost:${PORT}/auth/google/callback`
}, (token, tokenSecret, profile, done) => {
    return done(null, profile);
}));

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((obj, done) => {
    done(null, obj);
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Routes
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// Home route: render home view with posts and user
// We pass the posts and user variables into the home
// template
app.get("/", async (req, res) => {
    let sortType = req.query.sort;

    // No sort type was provided, so by default set to "recent"
    if (!sortType) {
        sortType = "recent";
    }

    const posts = await getPosts(sortType);
    const currentUser = await getCurrentUser(req) || {};

    // Use home.handlebars
    res.render("home", { posts, currentUser });
});

// Error route: render error page
app.get("/error", async (req, res) => {
    const user = await getCurrentUser(req);
    
    res.render("error", { user: user });
});

app.post("/posts", isAuthenticated, async (req, res) => {
    // Add new post and redirect to home
    // Corresponds with the code that uses the form method in home.handlebars
    const title = req.body.title;
    const content = req.body.content;
    const schedule = req.body.schedule;
    const deleteDate = req.body.deleteDate;
    const user = await findUserById(req.session.userId);

    await addPost(title, content, user, schedule, deleteDate);
    res.redirect("/");
});
app.post("/like/:id", isAuthenticated, (req, res) => {
    // Update post likes
    updatePostLikes(req, res);
});
app.get("/profile/:username", isAuthenticated, async (req, res) => {
    // Using the middleware isAuthenticated, which executes before the actual route function
    await renderProfile(req, res);
});

app.get("/avatar/:username", (req, res) => {
    // Serve the avatar image for the user
    const username = req.params.username;

    // Send the image back as a response
    res.sendFile(path.join(__dirname, username));
});
app.get("/logout", isAuthenticated, (req, res) => {
    logoutUser(req, res);
});
app.post("/delete/:id", isAuthenticated, async (req, res) => {
    // To reach this route, must be the current owner of the post (or, deleting post automatically after timer)
    // Also takes the postId from req
    const postId = req.params.id;

    await deletePost(postId);
});
app.post("/frame/:id", isAuthenticated, async (req, res) => {
    const postId = parseInt(req.params.id);

    await framePost(postId);
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
            .then(() => sendEmojis(req, res))
            .catch(error => {
                console.error("Error fetching emojis:", error);
            });
    } else {
        // File already exists, so directly send the emojis
        sendEmojis(req, res);
    }
});

app.get("/auth/google", passport.authenticate('google', { scope: ['profile'] }));

// Posnett's callback route with passport
app.get("/auth/google/callback",
	passport.authenticate("google", { failureRedirect: "/" }),
	async (req, res) => {
        // Code from 5/24 lecture with Dr. Posnett

        // Hash the user id and then store that instead of directly storing the id
		const googleId = req.user.id;

		const hashedGoogleId = hashId(googleId);

        // Store hashed version in the session since we successfully authenticated
		req.session.hashedGoogleId = hashedGoogleId;

		try {
            const user = await findUserByHashedGoogleId(hashedGoogleId);

            if (user) {
                req.session.userId = user.id;
				req.session.loggedIn = true;
				res.redirect("/");
            } else {
                res.redirect("/registerUsername");
            }
        } catch (err) {
            console.error("Error finding user:", err);
            res.redirect("/error");
        }
    }
);
app.get("/googleLogout", (req, res) => {
    logoutUser(req, res);
})
app.get("/registerUsername", (req, res) => {
    res.render("registerUsername", { regError: req.query.error });
});  
app.post("/registerUsername", async (req, res) => {
    await registerUsername(req, res);
});  
app.get("/logoutIFrame", (req, res) => {
    res.render("logoutIFrame", { regError: req.query.error });
});  
app.get("/logoutCallback", (req, res) => {
    res.render("googleLogout", { regError: req.query.error });
});
app.post("/changeUser", isAuthenticated, async (req, res) => {
    const newUser = await findUserByUsername(req.body.username);
    const currUser = await getCurrentUser(req);

    if (newUser) {
        // User already exists, so redirect to /registerUsername GET endpoint with these parameters
        res.redirect(`/profile/${currUser.username}?error=Username+already+exists`);
    } else {
        // Username doesn't exist, so we can register new user and redirect appropriately
        const db = await getDbConnection();
        const newUsername = req.body.username;
    
        try {
            await updateUsername(db, newUsername, currUser, req, res);
        } catch (error) {
            console.error("Error:", error);
        }
    
        await db.close();

        res.redirect(`/profile/${newUsername}`);
    } 
});
app.post("/class/:year", isAuthenticated, async (req, res) => {
    await updateClass(req);
});
app.post("/bio", isAuthenticated, async (req, res) => {
    await updateBio(req, res);
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Server Activation
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

async function cleanupOverduePosts() {
    // Clean up posts that were supposed to be deleted
    const db = await getDbConnection();
    let qry = "SELECT * FROM posts";
    const posts = await db.all(qry);

    for (const post of posts) {
        // Permanent post
        if (post.deleteDate === null || post.deleteDate === undefined) {
            continue;
        }

        // Check how much time remaining
        const currTime = getCurrTime();
        const deleteTime = new Date(post.deleteDate);
        deleteTime.setMinutes(deleteTime.getMinutes() - deleteTime.getTimezoneOffset());

        const interval = (deleteTime - currTime) / 1000;  // Get difference in seconds

        // Delete any overdue posts
        if (interval <= 0) {
            deletePost(post.id);
        } else {
            // Re-set up timer
            setTimeout(deletePost, interval, post.id);
            timerIdDictionary.set(post.id, timerId);
        }
    }

    await db.close();
}

cleanupOverduePosts();

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Support Functions and Variables
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// Local timerId dictionary using Map
let timerIdDictionary = new Map();

function destroyTimer(postId) {
    clearTimeout(timerIdDictionary.get(postId));
    timerIdDictionary.delete(postId);
}

// Code from 5/22 lecture with Dr. Posnett
async function getDbConnection() {
    let db = null;

    try {
        db = await sqlite.open({
            filename: path.join(__dirname, "whiteboard.db"),
            driver: sqlite3.Database
        });
    } catch (error) {
        console.error("Error:", error);
    }

    return db;
}

// Function to find a user by username
async function findUserByUsername(username) {
    const db = await getDbConnection();
    let user = null;

    try {
        let qry = "SELECT * FROM users WHERE username=? LIMIT 1";
        user = await db.get(qry, [username]);
    } catch (error) {
        console.error("Error:", error);
    }

    await db.close();
    
    return user;
}

// Function to find a user by their hashed Google id
async function findUserByHashedGoogleId(hashedGoogleId) {
    const db = await getDbConnection();
    let user = null;

    try {
        let qry = "SELECT * FROM users WHERE hashedGoogleId=? LIMIT 1";
        user = await db.get(qry, [hashedGoogleId]);
    } catch (error) {
        console.error("Error:", error);
    }

    await db.close();

    return user;
}

// Function to find a user by user ID
async function findUserById(userId) {
    const db = await getDbConnection();
    let user = null;

    try {
        let qry = "SELECT * FROM users WHERE id=? LIMIT 1";
        user = await db.get(qry, [userId]);
    } catch (error) {
        console.error("Error:", error);
    }

    await db.close();

    return user;
}

// Function to find posts by user ID
async function findPostsByUser(username, sortType="timestamp DESC") {
    const db = await getDbConnection();
    let posts = null;

    try {
        // Grab all posts from this user
        let qry = `SELECT * FROM posts WHERE username=? ORDER BY ${sortType}`;
        posts = await db.all(qry, [username]);
    } catch (error) {
        console.error("Error:", error);
    }

    await db.close();

    return posts;
}

// Function to find a post by the postId
async function findPostById(postId) {
    // Turn the id from string to number
    const id = parseInt(postId);
    const db = await getDbConnection();
    let post = null;

    try {
        // Grab the post with postId
        let qry = "SELECT * FROM posts WHERE id=?";
        post = await db.get(qry, [id]);
    } catch (error) {
        console.error("Error:", error);
    }

    await db.close();

    return post;
}

// Function to get current time and return as string
function getCurrTime() {
    const currTime = new Date();

    // Adjust time based on time zone
    currTime.setMinutes(currTime.getMinutes() - currTime.getTimezoneOffset());

    return currTime;
}

// Convert Date object to a string
function dateObjToStr(date) {
    return date.toISOString().slice(0,16);
}

// Function to add a new user to the database
async function addUser(username, hashedGoogleId) {
    const db = await getDbConnection();

    try {
        let qry = "INSERT INTO users(username, hashedGoogleId, memberSince) VALUES(?, ?, ?)";
        await db.run(qry, [username, hashedGoogleId, dateObjToStr(getCurrTime())]);
    } catch (error) {
        console.error("Error:", error);
    }

    await db.close();
}

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        // Finished processing info, so move on to the actual route function
        next();
    } else {
        console.log("Redirecting to home...");
        res.redirect("/");
    }
}

// Function to register a user
async function registerUsername(req, res) {
    let user = await findUserByUsername(req.body.username);

    if (user) {
        // User already exists, so redirect to /registerUsername GET endpoint with these parameters
        res.redirect("/registerUsername?error=Username+already+exists");
    } else {
        // Username doesn't exist, so we can register new user and redirect appropriately
        await addUser(req.body.username, req.session.hashedGoogleId);
        handleAvatar(req, res);

        // Fill in session info and redirect
        user = await findUserByUsername(req.body.username);
        req.session.userId = user.id;
        req.session.loggedIn = true;
        res.redirect("/");
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
            res.redirect("/logoutIFrame");
        }
    });
}

// Function to render the profile page
async function renderProfile(req, res) {
    const user = await findUserByUsername(req.params.username);
    const currUser = await getCurrentUser(req);
    const usersPosts = await findPostsByUser(user.username);
    const selectedClass = (user.classOf !== null && user.classOf !== undefined);  // There's a class associated with this user

    res.render("profile", { regError: req.query.error, posts: usersPosts, user: user, currentUser: currUser, selectedClass: selectedClass });
}

function updateLikes(currUsername, postLikes, likedBy) {
    if (likedBy === null || !likedBy.includes(currUsername)) {
        postLikes++;

        if (likedBy === null) {
            likedBy = "";
        }

        // Add username to the list of ppl who liked this post
        likedBy += `,${currUsername}`
    } else {
        postLikes--;

        // Remove username from the list of ppl who liked this post
        let i = likedBy.indexOf("," + currUsername);
        let leftSubstr = likedBy.substr(0, i);
        let rightSubstr = likedBy.substr(i + currUsername.length + 1);
        likedBy = leftSubstr + rightSubstr;
    }

    // Return numlikes and the string of usernames who liked this post
    return [postLikes, likedBy];
}


// Function to update post likes
async function updatePostLikes(req, res) {
    // Don't let user like the post if not logged in
    if (!req.session.userId) {
        res.redirect("/login");
    }

    const postId = req.params.id;
    const post = await findPostById(postId);
    const postUser = await findUserByUsername(post.username);
    const currUser = await getCurrentUser(req);

    // User is (un)liking a post that isn't theirs
    if (postUser !== currUser) {
        const db = await getDbConnection();

        try {
            let qry = "SELECT * FROM posts WHERE id=?";
            let row = await db.get(qry, [postId]);
            let likedBy = row.likedBy;

            const res = updateLikes(currUser.username, post.likes, likedBy);
            post.likes = res[0];
            likedBy = res[1];

            // Update database
            qry = "UPDATE posts SET likes = ?, likedBy = ? WHERE username = ?";
            await db.run(qry, [post.likes, likedBy, postUser.username]);
        } catch (error) {
            console.error("Error:", error);
        }

        await db.close();

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
async function handleAvatar(req, res) {
    const username = req.body.username;
    const db = await getDbConnection();

    if (username) {
        const buffer = generateAvatar(username[0]);
        const url = path.join("public", "images", username);
        const avatar_url = path.join("/", "images", username);

        // Update database and create file
        let qry = "UPDATE users SET avatar_url = ? WHERE username = ?";
        await db.run(qry, [avatar_url, username]);

        fs.writeFileSync(url, buffer);
    }

    await db.close();
}

// Function to get the current user from session
async function getCurrentUser(req) {
    // Return the user object if the session user ID matches
    const user = await findUserById(req.session.userId);
    
    return user;
}

// Delete given post
async function deletePost(postId) {
    const db = await getDbConnection();

    try {
        // Turn off timer
        destroyTimer(postId);

        // Delete post. If post doesn't exist, no changes are made
        let qry = "DELETE FROM posts WHERE id=?";
        await db.run(qry, [postId]);
    } catch (error) {
        console.error("Error:", error);
    }

    await db.close();
}

// Make the post permanent
async function framePost(postId) {
    const db = await getDbConnection();

    try {
        // Clear timer and update the database
        destroyTimer(postId);
        let qry = "UPDATE posts SET deleteDate=? WHERE id=?";
        await db.run(qry, [null, postId]);
    } catch (error) {
        console.error("Error:", error);
    }

    await db.close();
}

// Function to get all posts, sorted by latest first
async function getPosts(sortType="timestamp DESC") {
    const db = await getDbConnection();
    let rows = null;

    if (sortType === "recent") {
        sortType = "timestamp DESC";
    } else if (sortType === "oldest") {
        sortType = "timestamp";  // Ascending
    } else if (sortType === "most-liked") {
        sortType = "likes DESC";
    } else if (sortType === "least-liked") {
        sortType = "likes";
    } else {
        console.error("Unrecognized sort type");
        return null;
    }

    try {
        let qry = `SELECT * FROM posts ORDER BY ${sortType}`;
        rows = await db.all(qry);
    } catch (error) {
        console.error("Error:", error);
    }

    await db.close();

    return rows;
}

// Function to add a new post
async function addPost(title, content, user, schedule, date) {
    const db = await getDbConnection();
    const deleteTime = (schedule === "on" ? new Date(date) : null);
    const currTime = getCurrTime();
    let interval = 0;

    if (deleteTime !== null) {
        // Adjust for offset
        deleteTime.setMinutes(deleteTime.getMinutes() - deleteTime.getTimezoneOffset());
        interval = deleteTime - currTime;
    }

    try {
        let result = null;

        // Nonzero interval for delete time
        if (deleteTime !== null && interval > 0) {
            let qry = "INSERT INTO posts(title, content, username, timestamp, deleteDate) VALUES(?, ?, ?, ?, ?)";
            result = await db.run(qry, [title, content, user.username, dateObjToStr(currTime), dateObjToStr(deleteTime)]);

            // Set up the timer and store timer id in local var
            const timerId = setTimeout(deletePost, interval, result.lastID);
            const postId = result.lastID;
            timerIdDictionary.set(postId, timerId);
        } else if (deleteTime === null && interval === 0) {  // Did not schedule a delete time -- post should be permanent
            let qry = "INSERT INTO posts(title, content, username, timestamp) VALUES(?, ?, ?, ?)";
            result = await db.run(qry, [title, content, user.username, dateObjToStr(currTime)]);
        }  // If for some reason there was supposed to be scheduled deletion but interval = 0, don't bother adding the post
    } catch (error) {
        console.error("Error:", error);
    }

    await db.close();
}

async function updateUsername(db, newUsername, currUser, req, res) {
    // Update username in users table
    let qry = "UPDATE users SET username=? WHERE username=?";
    await db.run(qry, [newUsername, currUser.username]);

    // Update the name associated with their posts
    qry = "UPDATE posts SET username=? WHERE username=?";
    await db.run(qry, [newUsername, currUser.username]);

    // Generate new avatar and delete old avatar
    handleAvatar(req, res);
    fs.unlink(path.join("public", currUser.avatar_url),  (err) => {
        if (err) {
            console.error("Error:", err);
        }
    });
}

// Update database with the year given
async function updateClass(req) {
    const db = await getDbConnection();
    const year = req.params.year;
    const currUser = await getCurrentUser(req);

    try {
        let qry = "UPDATE users SET classOf=? WHERE id=?";
        await db.run(qry, [year, currUser.id]);
    } catch (error) {
        console.error("Error:", error);
    }

    await db.close();
}

// Update bio with the bio given
async function updateBio(req, res) {
    const bio = req.body.content;
    const user = await findUserById(req.session.userId);
    const db = await getDbConnection();

    try {
        let qry = "UPDATE users SET bio=? WHERE username=?";
        await db.run(qry, [bio, user.username]);
    } catch (error) {
        console.error("Error:", error);
    }

    await db.close();

    res.redirect(`/profile/${user.username}`);
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

// Hash the Google id
function hashId(idToHash) {
    try{
        const hashedId = crypto.createHash("sha256").update(idToHash).digest("hex");
        return hashedId;
    } catch (err) {
        console.log("Error: ", err);
    }
}

