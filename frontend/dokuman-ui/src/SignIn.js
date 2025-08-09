// src/SignIn.js
import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

function SignInForm() {
  const [state, setState] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleChange = (evt) => {
    const { name, value } = evt.target;
    setState((prev) => ({ ...prev, [name]: value }));
  };

  const handleOnSubmit = async (evt) => {
    evt.preventDefault();

    try {
      const { data } = await axios.post("http://localhost:5244/api/auth/login", {
        email: state.email,
        password: state.password,
      });

      // token + kullanıcı bilgilerini sakla
      localStorage.setItem("token", data.token);
      localStorage.setItem("email", data.email);
      localStorage.setItem("role", data.role);

      // panel'e git
      navigate("/DoCu");

      // form temizle
      setState({ email: "", password: "" });
      setError("");
    } catch (err) {
      const msg = err?.response?.data || "Bilinmeyen bir hata oluştu.";
      setError(msg);
      alert("Giriş başarısız: " + msg);
    }
  };

  return (
    <div className="form-container sign-in-container">
      <form onSubmit={handleOnSubmit}>
        <h1>Sign in</h1>
        <input
          type="email"
          placeholder="Email"
          name="email"
          value={state.email}
          onChange={handleChange}
          required
        />
        <input
          type="password"
          name="password"
          placeholder="Password"
          value={state.password}
          onChange={handleChange}
          required
        />
        <a href="#">Forgot your password?</a>
        <button type="submit">Sign In</button>
        {error && <p style={{ color: "red" }}>{error}</p>}
      </form>
    </div>
  );
}

export default SignInForm;
