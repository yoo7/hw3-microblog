"use strict";

const express = require("express");
const expressHandlebars = require("express-handlebars");
const session = require("express-session");
const canvas = require("canvas");
const fs = require("fs");
const path = require("path");

require("dotenv").config();

// TODO maybe we don't need these two anymore?
const { google } = require("googleapis");
const { OAuth2Client } = require("google-auth-library");

// const passport = require('passport');
// const GoogleStrategy = require('passport-google-oauth20').Strategy;

const sqlite3 = require("sqlite3");
const sqlite = require("sqlite");

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

// Configure passport
// passport.use(new GoogleStrategy({
//     clientID: CLIENT_ID,
//     clientSecret: CLIENT_SECRET,
//     callbackURL: `http://localhost:${PORT}/auth/google/callback`
// }, (token, tokenSecret, profile, done) => {
//     return done(null, profile);
// }));

// passport.serializeUser((user, done) => {
//     done(null, user);
// });

// passport.deserializeUser((obj, done) => {
//     done(null, obj);
// });

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Routes
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// Home route: render home view with posts and user
// We pass the posts and user variables into the home
// template
app.get("/", async (req, res) => {
    const posts = await getPosts();
    const user = await getCurrentUser(req) || {};
    console.log(user);

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
app.get("/error", async (req, res) => {
    const user = await getCurrentUser(req);
    
    res.render("error", { user: user });
});

// Additional routes that you must implement

app.post("/posts", isAuthenticated, async (req, res) => {
    // Add new post and redirect to home
    // Corresponds with the code that uses the form method in home.handlebars
    const title = req.body.title;
    const content = req.body.content;
    const user = await findUserById(req.session.userId);

    // TODO async stuff?
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
app.post("/register", async (req, res) => {
    // Register a new user
    await registerUser(req, res);
});
app.post("/login", async (req, res) => {
    // Login a user
    await loginUser(req, res);
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
// app.get("/auth/google", (req, res) => {
//     // Code from 5/22 discussion with Zeerak
//     // Want user email and profile
//     const url = client.generateAuthUrl({
//         access_type: "offline",
//         scope: ["https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"],
//     });

//     // Go to the callback function
//     // Once Google verifies authorization, it goes to the callback function below
//     res.redirect(url);
// });
// app.get("/auth/google/callback",
// 	passport.authenticate("google", { failureRedirect: "/" }),
// 	async (req, res) => {
//         // Code frmo 5/24 lecture with Dr. Posnett

// 		const googleId = req.user.id;
// 		const hashedGoogleId = hash(googleId);

//         // TODO he put this line here, but we don't have a hashedGoogleId line
//         // TODO but he also uses the userId attribute below so maybe we need both??
// 		req.session.hashedGoogleId = hashedGoogleId;

//         // TODO not sure if this is correct but modify as needed
// //     // TODO hash the user id and then store that instead of directly storing the id
// //     const user = getCurrentUser();
// //     const db = await getDbConnection();

// //     if (foundMatches(user)) {
// //         // TODO update the value in the SQL data base
// //         const hashedGoogleId = `${userinfo.data.picture}`
// //         let qry = "UPDATE users SET hashedGoogleId = ? WHERE username = ?";
// //         await db.run(qry, [hashedGoogleId, user.username]);

// //         fs.writeFileSync(url, buffer);
// //     }

// //     await db.close();
		
// 		try {
// 		// looking up in our database, so async
// 		// make the arrow function async!!! see at the third line of code
//             const db = await getDbConnection();
            
// 			let localUser = await findUserByHashedGoogleId(hashedGoogleId);
//             let qry = "UPDATE users SET hashedGoogleId = ? WHERE username = ?";
//             await db.run(qry, [hashedGoogleId, user.username]);

// 			if (localUser) {
// 				req.session.userId = localUser.id;
// 				req.session.loggedIn = true;
// 				res.redirect("/");
// 			} else {
// 			    res.redirect("/registerUsername");
// 			}
//         } catch (err) {
//             console.error("Error finding user:", err);
//             res.redirect("/error");
//         }

//         await db.close();
//     }
// );

// TODO delete this later
// app.get("/auth/google/callback", async (req, res) => {
//     // Code from 5/22 discussion with Zeerak
//     const { code } = req.query;
//     const { tokens } = await client.getToken(code);
//     client.setCredentials(tokens);

//     const oauth2 = google.oauth2({
//         auth: client,
//         version: "v2",
//     });

//     const userinfo = await oauth2.userinfo.get();

//     res.send(`
//         <h1>Hello, ${userinfo.data.name}</h1>
//         <p>Email: ${userinfo.data.email}</p>
//         <img src="${userinfo.data.picture}" alt="Profile Picture">
//         <br>
//         <a href="/logout">Logout from App</a>
//         <br>
//     `);

//   
// });

// TODO a href /auth/google

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Server Activation
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Support Functions and Variables
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// Code from 5/22 lecture with Dr. Posnett
async function getDbConnection() {
    const db = await sqlite.open({
        filename: path.join(__dirname, "whiteboard.db"),
        driver: sqlite3.Database
    });

    return db;
}

// Function to find a user by username
async function findUserByUsername(username) {
    const db = await getDbConnection();

    let qry = "SELECT * FROM users WHERE username=? LIMIT 1";
    let user = await db.get(qry, [username]);

    await db.close();

    return user;
}

async function findUserByHashedGoogleId(hashedGoogleId) {
    const db = await getDbConnection();

    let qry = "SELECT * FROM users WHERE hashedGoogleId=? LIMIT 1";
    let user = await db.get(qry, [hashedGoogleId]);

    await db.close();

    return user;
}

// TODO maybe delete? or keep and use with above too
// Function to find a user by user ID
async function findUserById(userId) {
    const db = await getDbConnection();

    let qry = "SELECT * FROM users WHERE id=? LIMIT 1";
    let user = await db.get(qry, [userId]);

    await db.close();

    return user;
}

// Function to find posts by user ID
async function findPostsByUser(username) {
    const db = await getDbConnection();

    let qry = "SELECT * FROM posts WHERE username=? ORDER BY timestamp DESC";
    let posts = await db.all(qry, [username]);

    await db.close();

    return posts;
}

// Function to find a post by the postId
async function findPostById(postId) {
    // Turn the id from string to number
    const id = parseInt(postId);

    const db = await getDbConnection();

    let qry = "SELECT * FROM posts WHERE id=?";
    let post = await db.get(qry, [id]);

    await db.close();

    return post;
}

// Function to get current time and return as string
function getCurrTime() {
    const date = new Date();
    return date.toLocaleTimeString([], {year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit"});
}

// Function to add a new user to the users array
async function addUser(username) {
    const db = await getDbConnection();

    let qry = "INSERT INTO users(username, timestamp) VALUES(?, ?)";
    let row = await db.run(qry, [username, getCurrTime()]);

    await db.close();
}

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    console.log(req.session.userId);

    if (req.session.userId) {
        // Finished processing info, so move on to the actual route function
        next();
    } else {
        console.log("Redirecting to login...");
        res.redirect("/login");
    }
}

function isEmptyObj(obj) {
    // Not an object
    if (typeof queryRes !== 'object') {
        return false;
    }

    // Check if it contains the key property
    for (let key in obj) {
        if (obj.hasOwnProperty(key)) {
            return false;
        }
    }

    // Did not find any of the keys, so it's an empty object
    return true;
}

function isEmptyArr(arr) {
    return Array.isArray(arr) && arr.length > 0;
}

function foundMatches(queryRes) {
    // Valid return result from the query string -- a nonempty object or a nonempty array
    return queryRes && (queryRes !== undefined) && (queryRes !== null) && (!isEmptyObj(queryRes) || !isEmptyArr(queryRes));
}

// Function to register a user
async function registerUser(req, res) {
    const user = await findUserByUsername(req.body.username);

    if (!foundMatches(user)) {
        // Username doesn't exist, so we can register new user and redirect appropriately
        addUser(req.body.username);
        // TODO some Google OAuth stuff?
        handleAvatar(req, res);
        res.redirect("/login");
    } else {
        // User already exists, so redirect to /register GET endpoint with these parameters
        res.redirect("/register?error=Username+already+exists");
    }    
}

// Function to login a user
async function loginUser(req, res) {
    const user = await findUserByUsername(req.body.username);

    // User exists
    if (foundMatches(user)) {
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
async function renderProfile(req, res) {
    // Fetch user posts and render the profile page
    const user = await getCurrentUser(req);
    const usersPosts = await findPostsByUser(user.username);
    
    res.render("profile", { posts: usersPosts, user: user })
}

// Function to update post likes
async function updatePostLikes(req, res) {
    // Don't let user like the post if not logged in
    if (!req.session.userId) {
        res.redirect("/login");
    }

    const postId = req.params.id;
    const post = await findPostById(postId);
    const user = await findUserByUsername(post.username);

    // User is (un)liking a post that isn't theirs
    if (user.id !== req.session.userId) {
        const db = await getDbConnection();

        const likeUp = req.body.likeUp;

        if (likeUp === "true") {
            post.likes++;
        } else {
            post.likes--;
        }

        let qry = "UPDATE posts SET likes = ? WHERE username = ?";
        await db.run(qry, [post.likes, user.username]);

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
        const url = `public/images/${username}`;
        const avatar_url = `/images/${username}`;

        // TODO remove/update eventually when we have the Google OAuth stuff...
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

// Function to get all posts, sorted by latest first
async function getPosts() {
    const db = await getDbConnection();

    let qry = "SELECT * FROM posts ORDER BY timestamp DESC";
    let rows = await db.all(qry);

    await db.close();

    return rows;
}

// Function to add a new post
async function addPost(title, content, user) {
    const db = await getDbConnection();

    let qry = "INSERT INTO posts(title, content, username, timestamp, likes) VALUES(?, ?, ?, ?, ?)";
    await db.run(qry, [title, content, user.username, getCurrTime(), 0]);

    await db.close();
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
