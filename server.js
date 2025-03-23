require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: "http://localhost:5173", credentials: true }));

mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log(err));
  const TaskSchema = new mongoose.Schema({
    taskId: { type: String, unique: true },
    taskName: { type: String, required: true },
    taskDescription: { type: String, required: true },
    priority: { type: String, enum: ["Low", "Medium", "High"], default: "Low" },
    dueDate: { type: Date, required: true },
    status: { type: String, enum: ["Pending", "In Progress", "Completed"], default: "Pending" },
    createdAt: { type: Date, default: Date.now }, // Automatically stores the current date when created
  });
    
  const UserSchema = new mongoose.Schema({
    username: String,
    email: String,
    password: String,
    role: String,
    tasks: [TaskSchema],
  });
  
  const User = mongoose.model("User", UserSchema);
  


// Middleware to check authentication
const authenticate = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.status(403).json({ error: "Access Denied" });

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified;
    console.log("Verified User:", req.user); // Debugging
    next();
  } catch (error) {
    res.status(403).json({ error: "Invalid Token" });
  }
};



// Fetch tasks for a user
app.post("/tasks", authenticate, async (req, res) => {
  try {
    const { taskName, taskDescription, priority, dueDate, status } = req.body;

    const newTask = {
      taskId: new mongoose.Types.ObjectId().toString(),
      taskName,
      taskDescription,
      priority,
      dueDate: new Date(dueDate),
      status: status || "Pending",
      createdAt: new Date(),
    };

    const user = await User.findOneAndUpdate(
      { _id: req.user.userId }, // Fix: Use `userId` instead of `_id`
      { $push: { tasks: newTask } },
      { new: true }
    );

    if (!user) return res.status(404).json({ error: "User not found" });

    res.status(201).json(newTask);
  } catch (error) {
    console.error("Error adding task:", error);
    res.status(500).json({ error: "Error adding task" });
  }
});

// Add task for the logged-in user
app.post("/tasks", authenticate, async (req, res) => {
  try {
    const { taskName, taskDescription, priority, dueDate, status } = req.body;

    const newTask = {
      taskId: new mongoose.Types.ObjectId().toString(),
      taskName,
      taskDescription,
      priority,
      dueDate: new Date(dueDate), // Ensure date format
      status,
      createdAt: new Date(), // Auto-set createdAt
    };

    const user = await User.findOneAndUpdate(
      { _id: req.user._id },
      { $push: { tasks: newTask } },
      { new: true }
    );

    res.status(201).json(newTask);
  } catch (error) {
    console.error("Error adding task:", error);
    res.status(500).json({ error: "Error adding task" });
  }
});

// Delete task for the logged-in user or for any user (admin only)
app.delete("/tasks/:taskId", authenticate, async (req, res) => {
  const { taskId } = req.params;

  try {
    // Find the user that owns the task
    const user = await User.findOne({ "tasks.taskId": taskId });

    if (!user) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Remove the task from the user's tasks array
    user.tasks = user.tasks.filter((task) => task.taskId !== taskId);
    await user.save();

    res.status(200).json({ message: "Task deleted successfully" });
  } catch (error) {
    console.error("Error deleting task:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Fetch tasks for all users (admin only)
app.get("/tasks", authenticate, async (req, res) => {
  try {
    console.log("Authenticated User ID:", req.user.userId); // Debugging
    const user = await User.findById(req.user.userId); // Fix: Use `userId`
    
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json(user.tasks);
  } catch (error) {
    console.error("Error fetching tasks:", error);
    res.status(500).json({ error: "Error fetching tasks" });
  }
});
app.get("/tasks/all", async (req, res) => {
  try {
    const users = await User.find({}, "username tasks"); // Fetch all users with their tasks
    let allTasks = [];
    users.forEach(user => {
      user.tasks.forEach(task => {
        allTasks.push({
          ...task.toObject(),
          username: user.username, // Attach username to each task
        });
      });
    });

    res.json(allTasks);
  } catch (error) {
    console.error("Error fetching tasks:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});


// Update task for the logged-in user
app.put("/tasks/:taskId", authenticate, async (req, res) => {
  try {
    const { taskId } = req.params;
    const { taskName, taskDescription, priority, dueDate, status } = req.body;

    const updatedUser = await User.findOneAndUpdate(
      { _id: req.user.userId, "tasks.taskId": taskId }, // Find user and the specific task
      {
        $set: {
          "tasks.$.taskName": taskName,
          "tasks.$.taskDescription": taskDescription,
          "tasks.$.priority": priority,
          "tasks.$.dueDate": new Date(dueDate),
          "tasks.$.status": status,
        },
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ error: "Task not found" });
    }

    const updatedTask = updatedUser.tasks.find((task) => task.taskId === taskId);
    res.json(updatedTask); // Send the updated task back to frontend
  } catch (error) {
    console.error("Error updating task:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


// Register Route
app.post("/register", async (req, res) => {
  const { username, email, password, role } = req.body;
  if (!role) return res.status(400).json({ error: "Role is required" });

  try {
    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: "Email already in use" });
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, email, password: hashedPassword, role });
    await user.save();
    res.json({ message: "User registered successfully!" });
  } catch (error) {
    res.status(400).json({ error: "User registration failed" });
  }
});

// Login Route
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });

  if (!user) return res.status(400).json({ error: "User not found" });

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) return res.status(400).json({ error: "Invalid password" });

  const token = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "1h" });
  console.log(token, "11");

  res.cookie("token", token, {
    httpOnly: true,
    secure: false, // In production, set secure to true
    expires: new Date(Date.now() + 3600000), // 1 hour expiry
    sameSite: "Strict",
  });

  res.json({ message: "Login successful!", role: user.role }); // Send role to frontend
});

// Logout Route
app.post("/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ message: "Logged out successfully!" });
});

// Protected Route
app.get("/dashboard", authenticate, (req, res) => {
  // Here you can check the role of the user and return content accordingly
  if (req.user.role === "admin") {
    res.json({ message: "Welcome Admin! You have full access." });
  } else {
    res.json({ message: `Welcome User ${req.user.username}! You can only manage your tasks.` });
  }
});

// Start the server
app.listen(5000, () => console.log("Server running on port 5000"));
