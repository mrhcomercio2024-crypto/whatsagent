import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, isStrongEnough } from "./passwords";

describe("passwords helper", () => {
  describe("isStrongEnough", () => {
    it("rejeita senhas curtas", () => {
      expect(isStrongEnough("Ab1")).toBe(false);
      expect(isStrongEnough("")).toBe(false);
      expect(isStrongEnough("1234567")).toBe(false);
    });
    it("rejeita senhas sem dígito", () => {
      expect(isStrongEnough("abcdefgh")).toBe(false);
      expect(isStrongEnough("PasswordABC")).toBe(false);
    });
    it("rejeita senhas sem letra", () => {
      expect(isStrongEnough("12345678")).toBe(false);
      expect(isStrongEnough("$$$ 1234 ###")).toBe(false);
    });
    it("aceita senhas fortes (>=8 chars com letra+dígito)", () => {
      expect(isStrongEnough("abc12345")).toBe(true);
      expect(isStrongEnough("Ferramenta1703$")).toBe(true);
      expect(isStrongEnough("MyP@ss1!")).toBe(true);
    });
  });

  describe("hashPassword + verifyPassword", () => {
    it("verifica corretamente a senha contra o hash", async () => {
      const hash = await hashPassword("Ferramenta1703$");
      expect(hash).toBeTypeOf("string");
      expect(hash.length).toBeGreaterThan(50);
      expect(hash.startsWith("$2")).toBe(true);
      expect(await verifyPassword("Ferramenta1703$", hash)).toBe(true);
      expect(await verifyPassword("ferramenta1703$", hash)).toBe(false);
      expect(await verifyPassword("wrong", hash)).toBe(false);
    });
    it("retorna false para entradas vazias/nulas", async () => {
      const hash = await hashPassword("abc12345");
      expect(await verifyPassword(null, hash)).toBe(false);
      expect(await verifyPassword(undefined, hash)).toBe(false);
      expect(await verifyPassword("abc12345", null)).toBe(false);
      expect(await verifyPassword("abc12345", undefined)).toBe(false);
      expect(await verifyPassword("", hash)).toBe(false);
    });
    it("hashes do mesmo plain são diferentes (salt aleatório)", async () => {
      const a = await hashPassword("abc12345");
      const b = await hashPassword("abc12345");
      expect(a).not.toBe(b);
      expect(await verifyPassword("abc12345", a)).toBe(true);
      expect(await verifyPassword("abc12345", b)).toBe(true);
    });
  });
});
