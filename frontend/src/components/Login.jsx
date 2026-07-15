import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { API_BASE } from "../utils";

export default function Login({ onLogin }) {
  const [tab, setTab] = useState("student");
  const [regNo, setRegNo] = useState(""); 
  const [password, setPassword] = useState("");

  // 🛑 CORE ATTRIBUTION - DO NOT REMOVE
  useEffect(() => {
    console.log(
      "%c AURA: Automated University Results & Assessment System \n%c System Engineered & Developed by Harish kumar G U & Ragava Jayasree S\n © " + new Date().getFullYear() + " St. Peter's College of Engineering and Technology ",
      "font-size: 16px; font-weight: bold; color: #4f46e5; padding: 5px 0;",
      "font-size: 12px; color: #10b981; font-weight: bold; padding-bottom: 5px;"
    );
  }, []);

  const handleLogin = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    
    let pass1 = password.trim(); 
    let pass2 = password.trim(); 
    let pass3 = password.trim(); 

    if (tab === "student" && pass1.includes("-")) {
      const parts = pass1.split("-");
      if (parts[0].length === 4) { 
        pass2 = `${parts[2]}-${parts[1]}-${parts[0]}`; 
        pass3 = `${parseInt(parts[1])}/${parseInt(parts[2])}/${parts[0].substring(2)}`; 
      }
    }

    try {
      const passwordsToTry = tab === "student" ? [pass1, pass2, pass3] : [pass1];
      let res = null;
      let data = null;

      for (let p of passwordsToTry) {
        res = await fetch(`${API_BASE}/api/auth/login`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ registerNumber: tab === "admin" ? "admin" : regNo.trim(), password: p, role: tab }),
        });
        
        if (res.ok) {
           data = await res.json();
           break; 
        }
      }

      if (!res || !res.ok) throw new Error("Login failed");
      
      onLogin({ role: data.role || data.user?.role, name: data.name || "", registerNumber: data.registerNumber || (tab === "admin" ? "admin" : regNo.trim()), department: data.department || "Unknown" });
    } catch { 
      alert("Invalid credentials. Please verify your Register Number and Password."); 
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-cover bg-center relative pb-24" style={{ backgroundImage: "url('/college-bg.jpg')" }}>
      <div className="absolute inset-0 bg-black/40" />
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="relative z-10 w-[480px] p-6 glacier-card bg-white/90 backdrop-blur-sm rounded-xl shadow-2xl">
        <div className="flex items-end gap-6 mb-4"><div className="text-slate-800 text-lg font-semibold">SPCET Portal</div><div className="flex-1 border-b border-slate-400/40" /></div>
        <div className="p-4">
          <div className="flex gap-2 mb-6 bg-gray-100 p-1 rounded-lg">
            {["student", "faculty", "hod", "admin"].map((t) => (
              <button key={t} onClick={() => { setTab(t); setRegNo(""); setPassword(""); }} className={`flex-1 py-2 rounded-md text-xs font-bold uppercase transition-all ${tab === t ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>{t}</button>
            ))}
          </div>
          <div className="space-y-4">
            <input value={tab === "admin" ? "admin" : regNo} onChange={(e) => setRegNo(e.target.value)} disabled={tab === "admin"} placeholder={tab === "admin" ? "admin" : "Register Number / ID"} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            
            {tab === "student" ? (
              <div className="relative mt-2">
                <label className="text-[10px] font-bold text-gray-500 absolute -top-2 left-3 bg-white px-1 uppercase tracking-wider">Date of Birth</label>
                <input type="date" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-gray-700" />
              </div>
            ) : (
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            )}

            <button onClick={handleLogin} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-all active:scale-95">Login as {tab.toUpperCase()}</button>
          </div>
        </div>
      </motion.div>

      {/* =========================================================================
          🛑 CORE COPYRIGHT & ATTRIBUTION - DO NOT MODIFY OR REMOVE 🛑
          System explicitly designed and developed by Harish kumar G U and Ragava Jayasree.
          ========================================================================= */}
      <div className="absolute bottom-0 w-full bg-slate-900 text-slate-400 py-4 text-center text-[11px] border-t-2 border-indigo-600 z-50">
        <p className="font-bold text-slate-200 tracking-widest uppercase mb-1 text-xs">
          © {new Date().getFullYear()} St. Peter's College of Engineering and Technology
        </p>
        <p className="tracking-widest uppercase mb-2 font-semibold">
          AURA: Automated University Results & Assessment System
        </p>
        <div className="flex items-center justify-center gap-3 opacity-90">
          <span className="uppercase tracking-widest text-slate-500 font-bold">Engineered By</span>
          <span className="font-bold text-indigo-400 tracking-wider cursor-default hover:text-indigo-300 transition-colors">HARISH KUMAR G U</span> 
          <span className="text-slate-600">|</span> 
          <span className="font-bold text-indigo-400 tracking-wider cursor-default hover:text-indigo-300 transition-colors">RAGAVA JAYASREE S</span>
        </div>
      </div>
      {/* 🛑 END OF ATTRIBUTION 🛑 */}

    </div>
  );
}