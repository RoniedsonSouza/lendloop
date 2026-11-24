/** Clerk dev-instance test users ("+clerk_test" emails accept the fixed code 424242; no real mail is sent). */
export const USERS = {
  lender: { email: "lender+clerk_test@example.com", firstName: "Lena", lastName: "Lender" },
  borrower: { email: "borrower+clerk_test@example.com", firstName: "Bruno", lastName: "Borrower" },
  admin: { email: "admin+clerk_test@example.com", firstName: "Ada", lastName: "Admin" },
} as const;

export type Role = keyof typeof USERS;
export const storageState = (role: Role) => `e2e/.auth/${role}.json`;
