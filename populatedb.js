// populatedb.js

const sqlite = require("sqlite");
const sqlite3 = require("sqlite3");

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
            likes INTEGER NOT NULL
        );
    `);

    // Example data for posts and users
    const users = [
        { username: "whatsyelp", hashedGoogleId: "hashedGoogleId1", avatar_url: "", memberSince: "2023-12-17 10:11:00" },
        { username: "technologically-challenged", hashedGoogleId: "hashedGoogleId2", avatar_url: "", memberSince: "2024-02-03 20:34:00" },
        { username: "SuperStudious", hashedGoogleId: "hashedGoogleId3", avatar_url: "", memberSince: "2024-03-02 15:12:00" },
    ];

    const posts = [
        { title: "New pizza place", content: "new pizza place p good #notsponsored", username: "whatsyelp", timestamp: "2024-01-02 13:32:00", likes: 0 },
        { title: "it be like dat", content: "The printer isn't working :(", username: "technologically-challenged", timestamp: "2024-03-24, 17:31:00", likes: 0 },
        { title: "MIDTERM SEASON...", content: "Studying for my web dev midterm...", username: "SuperStudious", timestamp: "2024-04-29, 01:04:00", likes: 0 },
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