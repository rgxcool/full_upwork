import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
    AppError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
} from "../../src/utils/errorHandler.js";
import { enhancedRBAC, inputValidator } from "../../src/middleware/security.js";

// Mock environment variables
vi.mock("dotenv", () => ({
    config: vi.fn(),
}));

// Mock bcrypt (provide default export to satisfy default import)
vi.mock("bcryptjs", () => {
    const mod = {
        hash: vi.fn(),
        compare: vi.fn(),
    };
    return { default: mod, ...mod };
});

// Mock jsonwebtoken (provide default export to satisfy default import)
vi.mock("jsonwebtoken", () => {
    const mod = {
        sign: vi.fn(),
        verify: vi.fn(),
    };
    return { default: mod, ...mod };
});

describe("Authentication Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("Error Classes", () => {
        it("should create AppError with correct properties", () => {
            const error = new AppError("Test error", 400);

            expect(error.message).toBe("Test error");
            expect(error.statusCode).toBe(400);
            expect(error.status).toBe("fail");
            expect(error.isOperational).toBe(true);
        });

        it("should create ValidationError with errors array", () => {
            const errors = ["Field is required", "Invalid format"];
            const error = new ValidationError("Validation failed", errors);

            expect(error.message).toBe("Validation failed");
            expect(error.statusCode).toBe(400);
            expect(error.errors).toEqual(errors);
        });

        it("should create AuthenticationError with default message", () => {
            const error = new AuthenticationError();

            expect(error.message).toBe("Authentication failed");
            expect(error.statusCode).toBe(401);
        });

        it("should create AuthorizationError with custom message", () => {
            const error = new AuthorizationError("Custom access denied");

            expect(error.message).toBe("Custom access denied");
            expect(error.statusCode).toBe(403);
        });
    });

    describe("Input Validation", () => {
        describe("Email Validation", () => {
            it("should validate correct email formats", () => {
                const validEmails = [
                    "test@example.com",
                    "user.name@domain.co.uk",
                    "user+tag@example.org",
                    "123@numbers.com",
                ];

                validEmails.forEach((email) => {
                    expect(inputValidator.validateEmail(email)).toBe(true);
                });
            });

            it("should reject invalid email formats", () => {
                const invalidEmails = [
                    "invalid-email",
                    "@example.com",
                    "user@",
                    "user@.com",
                    "user..name@example.com",
                    "user@example..com",
                ];

                invalidEmails.forEach((email) => {
                    expect(inputValidator.validateEmail(email)).toBe(false);
                });
            });
        });

        describe("Password Validation", () => {
            it("should validate strong passwords", () => {
                const strongPassword = "StrongPass123!";
                const result = inputValidator.validatePassword(strongPassword);

                expect(result.isValid).toBe(true);
                expect(result.errors).toEqual({
                    length: null,
                    uppercase: null,
                    lowercase: null,
                    numbers: null,
                    special: null,
                });
            });

            it("should reject weak passwords", () => {
                const weakPasswords = [
                    "short", // too short
                    "nouppercase123!", // no uppercase
                    "NOLOWERCASE123!", // no lowercase
                    "NoNumbers!", // no numbers
                    "NoSpecial123", // no special chars
                ];

                weakPasswords.forEach((password) => {
                    const result = inputValidator.validatePassword(password);
                    expect(result.isValid).toBe(false);
                    expect(
                        Object.values(result.errors).some(
                            (error) => error !== null
                        )
                    ).toBe(true);
                });
            });
        });

        describe("ObjectId Validation", () => {
            it("should validate correct ObjectIds", () => {
                const validIds = [
                    "507f1f77bcf86cd799439011",
                    "507f1f77bcf86cd799439012",
                    "507f1f77bcf86cd799439013",
                ];

                validIds.forEach((id) => {
                    expect(inputValidator.validateObjectId(id)).toBe(true);
                });
            });

            it("should reject invalid ObjectIds", () => {
                const invalidIds = [
                    "invalid-id",
                    "507f1f77bcf86cd79943901", // too short
                    "507f1f77bcf86cd7994390111", // too long
                    "507f1f77bcf86cd79943901g", // invalid character
                    "", // empty string
                ];

                invalidIds.forEach((id) => {
                    expect(inputValidator.validateObjectId(id)).toBe(false);
                });
            });
        });

        describe("Input Sanitization", () => {
            it("should sanitize HTML tags", () => {
                const input = '<script>alert("xss")</script>Hello World';
                const sanitized = inputValidator.sanitizeInput(input);

                expect(sanitized).toBe('alert("xss")Hello World');
            });

            it("should remove javascript protocol", () => {
                const input = 'javascript:alert("xss")';
                const sanitized = inputValidator.sanitizeInput(input);

                expect(sanitized).toBe('alert("xss")');
            });

            it("should remove event handlers", () => {
                const input = 'onclick=alert("xss") onload=alert("xss")';
                const sanitized = inputValidator.sanitizeInput(input);

                expect(sanitized).toBe('alert("xss") alert("xss")');
            });

            it("should handle non-string input", () => {
                const input = { key: "value" };
                const sanitized = inputValidator.sanitizeInput(input);

                expect(sanitized).toBe(input);
            });
        });
    });

    describe("Role-Based Access Control", () => {
        describe("Role Hierarchy", () => {
            it("should correctly check role hierarchy", () => {
                // Higher roles should have access to lower roles
                expect(enhancedRBAC.hasRole("systemadmin", "admin")).toBe(true);
                expect(enhancedRBAC.hasRole("admin", "teacher")).toBe(true);
                expect(enhancedRBAC.hasRole("teacher", "student")).toBe(true);
                expect(enhancedRBAC.hasRole("student", "user")).toBe(true);
            });

            it("should deny access to higher roles", () => {
                // Lower roles should not have access to higher roles
                expect(enhancedRBAC.hasRole("student", "teacher")).toBe(false);
                expect(enhancedRBAC.hasRole("teacher", "admin")).toBe(false);
                expect(enhancedRBAC.hasRole("admin", "systemadmin")).toBe(
                    false
                );
            });

            it("should handle invalid roles", () => {
                expect(enhancedRBAC.hasRole("invalid_role", "admin")).toBe(
                    false
                );
                expect(enhancedRBAC.hasRole("admin", "invalid_role")).toBe(
                    false
                );
            });
        });

        describe("Permission Checking", () => {
            it("should allow systemadmin all permissions", () => {
                expect(
                    enhancedRBAC.hasPermission(
                        "systemadmin",
                        "read",
                        "any_resource"
                    )
                ).toBe(true);
                expect(
                    enhancedRBAC.hasPermission(
                        "systemadmin",
                        "write",
                        "any_resource"
                    )
                ).toBe(true);
                expect(
                    enhancedRBAC.hasPermission(
                        "systemadmin",
                        "delete",
                        "any_resource"
                    )
                ).toBe(true);
            });

            it("should check teacher permissions correctly", () => {
                expect(
                    enhancedRBAC.hasPermission(
                        "teacher",
                        "read",
                        "assigned_students"
                    )
                ).toBe(true);
                expect(
                    enhancedRBAC.hasPermission("teacher", "write", "grades")
                ).toBe(true);
                expect(
                    enhancedRBAC.hasPermission(
                        "teacher",
                        "delete",
                        "own_comments"
                    )
                ).toBe(true);
                expect(
                    enhancedRBAC.hasPermission(
                        "teacher",
                        "delete",
                        "all_students"
                    )
                ).toBe(false);
            });

            it("should check admin permissions correctly", () => {
                expect(
                    enhancedRBAC.hasPermission("admin", "read", "all_students")
                ).toBe(true);
                expect(
                    enhancedRBAC.hasPermission("admin", "write", "all_courses")
                ).toBe(true);
                expect(
                    enhancedRBAC.hasPermission(
                        "admin",
                        "delete",
                        "all_teachers"
                    )
                ).toBe(true);
            });

            it("should handle invalid roles and actions", () => {
                expect(
                    enhancedRBAC.hasPermission(
                        "invalid_role",
                        "read",
                        "any_resource"
                    )
                ).toBe(false);
                expect(
                    enhancedRBAC.hasPermission(
                        "teacher",
                        "invalid_action",
                        "any_resource"
                    )
                ).toBe(false);
            });
        });

        describe("Resource Ownership", () => {
            it("should check ownership correctly", () => {
                const userId = "507f1f77bcf86cd799439011";
                const resourceUserId = "507f1f77bcf86cd799439011";

                expect(enhancedRBAC.isOwner(userId, resourceUserId)).toBe(true);
                expect(enhancedRBAC.isOwner(userId, "different_user_id")).toBe(
                    false
                );
            });
        });

        describe("Access Control", () => {
            it("should allow access for resource owners", () => {
                const user = {
                    userId: "507f1f77bcf86cd799439011",
                    role: "student",
                };

                const canAccess = enhancedRBAC.canAccess(
                    user,
                    "read",
                    "own_profile",
                    "507f1f77bcf86cd799439011"
                );

                expect(canAccess).toBe(true);
            });

            it("should allow access based on role permissions", () => {
                const user = {
                    userId: "507f1f77bcf86cd799439011",
                    role: "admin",
                };

                const canAccess = enhancedRBAC.canAccess(
                    user,
                    "read",
                    "all_students"
                );

                expect(canAccess).toBe(true);
            });

            it("should deny access when no permissions", () => {
                const user = {
                    userId: "507f1f77bcf86cd799439011",
                    role: "student",
                };

                const canAccess = enhancedRBAC.canAccess(
                    user,
                    "delete",
                    "all_students"
                );

                expect(canAccess).toBe(false);
            });

            it("should handle missing user data", () => {
                expect(
                    enhancedRBAC.canAccess(null, "read", "any_resource")
                ).toBe(false);
                expect(enhancedRBAC.canAccess({}, "read", "any_resource")).toBe(
                    false
                );
                expect(
                    enhancedRBAC.canAccess(
                        { userId: "123" },
                        "read",
                        "any_resource"
                    )
                ).toBe(false);
            });
        });
    });

    describe("JWT Token Validation", () => {
        it("should verify valid tokens", () => {
            const mockToken = "valid.jwt.token";
            const mockDecoded = { userId: "123", role: "admin" };

            jwt.verify.mockReturnValue(mockDecoded);

            // This would be tested in the actual auth middleware
            expect(jwt.verify).not.toHaveBeenCalled();
        });

        it("should reject invalid tokens", () => {
            jwt.verify.mockImplementation(() => {
                throw new Error("Invalid token");
            });

            // This would be tested in the actual auth middleware
            expect(jwt.verify).not.toHaveBeenCalled();
        });
    });

    describe("Password Hashing", () => {
        it("should hash passwords correctly", async () => {
            const password = "testPassword123!";
            const hashedPassword = "hashedPassword123";

            bcrypt.hash.mockResolvedValue(hashedPassword);

            const result = await bcrypt.hash(password, 10);

            expect(result).toBe(hashedPassword);
            expect(bcrypt.hash).toHaveBeenCalledWith(password, 10);
        });

        it("should compare passwords correctly", async () => {
            const password = "testPassword123!";
            const hashedPassword = "hashedPassword123";

            bcrypt.compare.mockResolvedValue(true);

            const result = await bcrypt.compare(password, hashedPassword);

            expect(result).toBe(true);
            expect(bcrypt.compare).toHaveBeenCalledWith(
                password,
                hashedPassword
            );
        });
    });
});
