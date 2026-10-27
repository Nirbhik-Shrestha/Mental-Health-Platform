import { z } from "zod";
import mongoose from "mongoose";

// Shared request-validation building blocks.

export const username = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(30, "Username must be at most 30 characters")
  .regex(/^[a-zA-Z0-9_.]+$/, "Use only letters, numbers, dots and underscores");

export const email = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address"));

export const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters");

export const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9\s-]{7,20}$/, "Enter a valid phone number");

export const dob = z.iso.date("Enter a valid date").refine((value) => new Date(value) < new Date(), {
  message: "Date of birth must be in the past",
});

/** Makes a field optional, treating "" and null (e.g. an empty form input) as not provided. */
export const optional = (schema) =>
  z.preprocess((value) => (value === "" || value === null ? undefined : value), schema.optional());

/** Optional free text; empty strings become undefined. */
export const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === "" ? undefined : value));

export const objectId = z.string().refine((value) => mongoose.isValidObjectId(value), "Invalid id");

export const stringList = (maxItems, maxLength) =>
  z.array(z.string().trim().min(1).max(maxLength)).max(maxItems);
