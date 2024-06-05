// populatedb.js

const sqlite = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");

// Placeholder for the database file name
const dbFileName = "whiteboard.db";

async function initializeDB() {
    const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            hashedGoogleId TEXT NOT NULL UNIQUE,
            avatar_url TEXT,
            memberSince DATETIME NOT NULL,
            bio TEXT DEFAULT "Hello world!",
            classOf TEXT
        );

        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            username TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            likes INTEGER DEFAULT 0,
            likedBy STRING,
            deleteDate DATETIME
        );
    `);

    // Example data for posts and users
    const users = [
        { username: "whatsyelp", hashedGoogleId: "hashedGoogleId1", avatar_url: "/images/whatsyelp", memberSince: "2023-12-17T10:11", bio: "yelp? don't know her", classOf: "2024" },
        { username: "technologically-challenged", hashedGoogleId: "hashedGoogleId2", avatar_url: "/images/technologically-challenged", memberSince: "2024-02-03T:20:34", bio: "how do i use this", classOf: "2026" },
        { username: "SuperStudious", hashedGoogleId: "hashedGoogleId3", avatar_url: "/images/SuperStudious", memberSince: "2024-03-02T15:12", bio: "Currently studying...", classOf: "2024" },
    ];

    const posts = [
        { title: "New pizza place", content: "new pizza place p good #notsponsored", username: "whatsyelp", timestamp: "2024-01-02T13:32", likes: 4, likedBy: ""},
        { title: "it be like dat", content: "The printer isn't working :(", username: "technologically-challenged", timestamp: "2024-03-24T17:31", likes: 2, likedBy: "" },
        { title: "MIDTERM SEASON...", content: "Studying for my web dev midterm...", username: "SuperStudious", timestamp: "2024-04-29T01:04", likes: 5, likedBy: "" },
    ];

    // Insert sample data into the database
    await Promise.all(users.map(user => {
        return db.run(
            "INSERT INTO users (username, hashedGoogleId, avatar_url, memberSince, bio, classOf) VALUES (?, ?, ?, ?, ?, ?)",
            [user.username, user.hashedGoogleId, user.avatar_url, user.memberSince, user.bio, user.classOf]
        );
    }));

    await Promise.all(posts.map(post => {
        return db.run(
            "INSERT INTO posts (title, content, username, timestamp, likes) VALUES (?, ?, ?, ?, ?)",
            [post.title, post.content, post.username, post.timestamp, post.likes]
        );
    }));

    console.log("Database populated with initial data.");
    await db.close();
}

initializeDB().catch(err => {
    console.error("Error initializing database:", err);
});