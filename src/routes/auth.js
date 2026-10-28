/**
 * routes/auth.js
 * ------------------------------------------------------------------
 * Authentication routes. These mirror the Firebase Auth operations the
 * clients used to call:
 *   POST /register  -> createUserWithEmailAndPassword + users/{uid}
 *   POST /login     -> signInWithEmailAndPassword + read profile
 *   GET  /me        -> read the signed-in user's profile
 *   POST /logout    -> signOut
 */
import { Router } from "express";
import { register, login, me, logout, forgotPassword, resetPassword } from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.get("/me", requireAuth, me);
router.post("/logout", requireAuth, logout);

export default router;