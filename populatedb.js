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
            memberSince DATETIME NOT NULL
        );

        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            username TEXT NOT NULL,
            timestamp DATETIME NOT NULL,
            likes INTEGER NOT NULL,
            likedBy STRING
        );
    `);

    // Example data for posts and users
    const users = [
        { username: "whatsyelp", hashedGoogleId: "hashedGoogleId1", avatar_url: "/images/whatsyelp", memberSince: "12/17/2023, 10:11 AM" },
        { username: "technologically-challenged", hashedGoogleId: "hashedGoogleId2", avatar_url: "/images/technologically-challenged", memberSince: "2/3/2024, 8:34 PM" },
        { username: "SuperStudious", hashedGoogleId: "hashedGoogleId3", avatar_url: "/images/SuperStudious", memberSince: "3/2/2024, 3:12 PM" },
    ];

    const posts = [
        { title: "New pizza place", content: "new pizza place p good #notsponsored", username: "whatsyelp", timestamp: "1/2/2024, 1:32 PM", likes: 0, likedBy: ""},
        { title: "it be like dat", content: "The printer isn't working :(", username: "technologically-challenged", timestamp: "3/24/2024, 5:31 PM", likes: 0, likedBy: "" },
        { title: "MIDTERM SEASON...", content: "Studying for my web dev midterm...", username: "SuperStudious", timestamp: "4/29/2024, 1:04 AM", likes: 0, likedBy: "" },
    ];

    // Insert sample data into the database
    await Promise.all(users.map(user => {
        return db.run(
            "INSERT INTO users (username, hashedGoogleId, avatar_url, memberSince) VALUES (?, ?, ?, ?)",
            [user.username, user.hashedGoogleId, user.avatar_url, user.memberSince]
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