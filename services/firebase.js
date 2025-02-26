const admin = require("firebase-admin")
// const serviceAccount = require("../public/aastha-79202-firebase-adminsdk-47b38-99b2cc7f77.json");
const serviceAccount = require("./astha-firebase-adminsdk.json");
// Replace with your Firebase service account key file
// const serviceAccount = require("./astha-firebase-adminsdk.json")

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  // databaseURL: "https://aastha-79202.firebaseio.com"
  databaseURL:"https://chat-21387.firebaseio.com"
})

const db = admin.firestore(); // For Firestore
const rtdb = admin.database(); // For Realtime Database

module.exports = {admin,db,rtdb}