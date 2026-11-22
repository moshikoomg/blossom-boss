import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestHost } from "@tanstack/react-start/server";
import { createMeshulamProcess } from "./meshulam.server";

export const createMeshulamPayment = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    orderId: z.string().uuid(),
    sum: z.number().positive(),
    fullName: z.string().min(1).max(120),
    phone: z.string().min(1).max(40),
    email: z.string().max(200).optional().default(""),
  }).parse(d))
  .handler(async ({ data }) => {
    const host = getRequestHost();
    const origin = `https://${host}`;
    return await createMeshulamProcess({ ...data, email: data.email || "", origin });
  });
