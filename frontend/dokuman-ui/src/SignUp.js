// src/SignUp.js
import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

function SignUpForm() {
  const [state, setState] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setState((s) => ({ ...s, [name]: value }));
  };

  const handleOnSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const payload = {
        name: state.name.trim(),
        email: state.email.trim(),
        password: state.password,
      };

      const res = await axios.post("http://localhost:5244/api/users/register", payload);

      // rol/email/token sakla
      if (res.data?.user) {
        localStorage.setItem("role", res.data.user.role || "User");
        localStorage.setItem("email", res.data.user.email);
      }
      if (res.data?.token) {
        localStorage.setItem("token", res.data.token);
      }

      // Yönlendirme (token yoksa bile rol'e göre sayfaya geçebiliriz;
      // korumalı sayfalar token istiyorsa önce SignIn akışı gerekir.)
      const role = res.data?.user?.role || "User";
      alert("Kayıt başarılı!");
      setState({ name: "", email: "", password: "" });

      if (role === "Admin") navigate("/Admin");
      else navigate("/DoCu");
    } catch (error) {
      const msg =
        error.response?.data?.message ||
        error.response?.data ||
        "Bilinmeyen bir hata oluştu.";
      alert(`Kayıt sırasında hata: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="form-container sign-up-container">
      <form onSubmit={handleOnSubmit}>
        <h1>Create Account</h1>
        <input
          name="name"
          value={state.name}
          onChange={handleChange}
          placeholder="Enter your name and surname"
          required
        />
        <input
          type="email"
          name="email"
          value={state.email}
          onChange={handleChange}
          placeholder="Email"
          required
        />
        <input
          type="password"
          name="password"
          value={state.password}
          onChange={handleChange}
          placeholder="Password"
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? "Signing up..." : "Sign Up"}
        </button>
      </form>
    </div>
  );
}

export default SignUpForm;
