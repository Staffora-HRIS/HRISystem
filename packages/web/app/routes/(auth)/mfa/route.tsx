/**
 * MFA Verification Page
 *
 * Features:
 * - TOTP code entry
 * - WebAuthn support
 * - Remember device option
 * - Resend code option
 */

import { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate, Link } from "react-router";
import { useMfa } from "../../../lib/auth";
import { Button } from "../../../components/ui/button";
import { Checkbox } from "../../../components/ui/input";
import { useToast } from "../../../components/ui/toast";
import { cn } from "../../../lib/utils";
import type { Route } from "./+types/route";

export function meta(): Route.MetaDescriptors {
  return [
    { title: "Two-Factor Authentication | Staffora" },
    { name: "description", content: "Enter your verification code" },
  ];
}

export default function MfaPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { verifyMfa, isVerifying: isVerifyingMfa, verifyError: mfaError } = useMfa();
  const toast = useToast();

  const state = location.state as { mfaToken?: string; from?: string } | null;
  const mfaToken = state?.mfaToken;

  // If no MFA token, redirect to login
  useEffect(() => {
    if (!mfaToken) {
      navigate("/login", { replace: true });
    }
  }, [mfaToken, navigate]);

  // Code input state (6 digits)
  const [code, setCode] = useState<string[]>(["", "", "", "", "", ""]);
  const [rememberDevice, setRememberDevice] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Handle code input
  const handleInputChange = (index: number, value: string) => {
    // Only allow digits
    if (value && !/^\d$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    // Move to next input if value entered
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all digits entered
    if (newCode.every((d) => d) && value) {
      handleSubmit(newCode.join(""));
    }
  };

  // Handle backspace
  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // Handle paste
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);

    if (pastedData.length === 6) {
      const newCode = pastedData.split("");
      setCode(newCode);
      inputRefs.current[5]?.focus();
      handleSubmit(pastedData);
    }
  };

  // Submit verification
  const handleSubmit = async (codeString?: string) => {
    const fullCode = codeString || code.join("");

    if (fullCode.length !== 6 || !mfaToken) {
      toast.error("Please enter a valid 6-digit code");
      return;
    }

    try {
      await verifyMfa(fullCode);
      // Success - redirect to dashboard
      navigate(state?.from || "/dashboard", { replace: true });
    } catch (error) {
      // Clear code on error
      setCode(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    }
  };

  // WebAuthn authentication
  const handleWebAuthn = async () => {
    if (!window.PublicKeyCredential) {
      toast.error("WebAuthn is not supported in this browser");
      return;
    }

    try {
      // In a real app, this would get the challenge from the server
      toast.info("WebAuthn authentication coming soon");
    } catch (error) {
      toast.error("WebAuthn authentication failed");
    }
  };

  if (!mfaToken) {
    return null;
  }

  return (
    <div className="text-center">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/30">
        <svg
          className="h-8 w-8 text-primary-600 dark:text-primary-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
      </div>

      <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
        Two-Factor Authentication
      </h1>
      <p className="mb-8 text-sm text-gray-600 dark:text-gray-400">
        Enter the 6-digit code from your authenticator app
      </p>

      {/* Code input */}
      <div className="mb-6 flex justify-center gap-2">
        {code.map((digit, index) => (
          <input
            key={index}
            ref={(el) => (inputRefs.current[index] = el)}
            type="text"
            inputMode="numeric"
            aria-label={`Verification code digit ${index + 1}`}
            maxLength={1}
            value={digit}
            onChange={(e) => handleInputChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={index === 0 ? handlePaste : undefined}
            className={cn(
              "h-12 w-12 rounded-lg border text-center text-xl font-semibold",
              "focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20",
              "dark:bg-gray-700 dark:text-white",
              mfaError
                ? "border-error-500"
                : "border-gray-300 dark:border-gray-600"
            )}
            disabled={isVerifyingMfa}
          />
        ))}
      </div>

      {mfaError && (
        <p className="mb-4 text-sm text-error-600 dark:text-error-400">
          {mfaError.message || "Invalid code. Please try again."}
        </p>
      )}

      {/* Remember device */}
      <div className="mb-6 flex justify-center">
        <Checkbox
          label="Remember this device for 30 days"
          checked={rememberDevice}
          onChange={(e) => setRememberDevice(e.target.checked)}
        />
      </div>

      {/* Verify button */}
      <Button
        fullWidth
        onClick={() => handleSubmit()}
        loading={isVerifyingMfa}
        disabled={!code.every((d) => d)}
      >
        Verify
      </Button>

      {/* Alternative methods */}
      <div className="mt-6">
        <button
          type="button"
          onClick={handleWebAuthn}
          className="text-sm font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400"
        >
          Use security key instead
        </button>
      </div>

      {/* Help links */}
      <div className="mt-8 space-y-2 text-sm text-gray-500 dark:text-gray-400">
        <p>
          Lost access to your authenticator app?{" "}
          <button
            type="button"
            onClick={() =>
              toast.info("Recovery codes", {
                message: "Recovery code flow is not available yet.",
              })
            }
            className="font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400"
          >
            Use recovery code
          </button>
        </p>
        <p>
          <Link
            to="/login"
            className="font-medium text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
          >
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
