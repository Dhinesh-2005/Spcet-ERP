import React, { useState } from "react";

// Import all of your beautifully split files!
import Login from "./components/Login";
import AdminDashboard from "./components/AdminDashboard";
import FacultyDashboard from "./components/FacultyDashboard";
import HodDashboard from "./components/HodDashboard";
import StudentDashboard from "./components/StudentDashboard";

export default function App() {
  const [user, setUser] = useState(null);
  
  // Clear the user state to log out
  const handleLogout = () => setUser(null);

  // 1. If no user is logged in, show the Login screen
  if (!user) {
    return <Login onLogin={setUser} />;
  }
  
  // 2. Route the user to the correct dashboard based on their role
  if (user.role === "admin") {
    return <AdminDashboard onLogout={handleLogout} />;
  }
  if (user.role === "hod") {
    return <HodDashboard user={user} onLogout={handleLogout} />;
  }
  if (user.role === "faculty") {
    return <FacultyDashboard user={user} onLogout={handleLogout} />;
  }
  if (user.role === "student") {
    return <StudentDashboard user={user} onLogout={handleLogout} />;
  }

  // 3. Fallback error UI if a role is misspelled
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
       <div className="p-10 bg-white rounded-xl shadow-lg text-center border border-red-200">
          <h2 className="text-2xl font-bold text-red-600 mb-2">Access Denied</h2>
          <p className="text-gray-600 font-medium">Unknown role: <span className="font-mono bg-gray-100 px-2 py-1 text-red-500 rounded">{user.role}</span></p>
          <button onClick={handleLogout} className="mt-6 bg-gray-800 text-white px-6 py-2 rounded-lg font-bold hover:bg-gray-900">Return to Login</button>
       </div>
    </div>
  );
}