import { useState } from "react";
import { Mail, LockKeyhole } from "lucide-react";
export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">ONB</div>
        <h1>Login</h1>
        <a className="google-login" href="/auth/google">
          <span className="google-mark">G</span>Login with Google
        </a>
        <div className="login-divider">
          <span>or sign up through email</span>
        </div>
        <form onSubmit={(e) => e.preventDefault()}>
          <label>
            Email ID
            <span className="login-input">
              <Mail size={17} />
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </span>
          </label>
          <label>
            Password
            <span className="login-input">
              <LockKeyhole size={17} />
              <input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </span>
          </label>
          <button className="login-submit">Login</button>
        </form>
      </section>
    </main>
  );
}
