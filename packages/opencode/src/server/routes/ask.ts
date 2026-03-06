import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { Session } from "../../session"
import { SessionPrompt } from "../../session/prompt"
import { Provider } from "../../provider/provider"
import { Config } from "../../config/config"
import { errors } from "../error"
import { lazy } from "../../util/lazy"
import { Log } from "../../util/log"
import { ConfigMarkdown } from "../../config/markdown"
import { Instance } from "../../project/instance"
import path from "path"
import fs from "fs/promises"
import os from "os"
import { pathToFileURL } from "bun"

const log = Log.create({ service: "ask" })

async function resolveFileReferences(query: string): Promise<{
  parts: SessionPrompt.PromptInput["parts"]
  fileCount: number
}> {
  const parts: SessionPrompt.PromptInput["parts"] = [
    { type: "text", text: query },
  ]

  const files = ConfigMarkdown.files(query)
  const seen = new Set<string>()

  await Promise.all(
    files.map(async (match) => {
      const name = match[1]
      if (seen.has(name)) return
      seen.add(name)

      const filepath = name.startsWith("~/")
        ? path.join(os.homedir(), name.slice(2))
        : path.resolve(Instance.worktree, name)

      const stats = await fs.stat(filepath).catch(() => undefined)
      if (!stats) return

      if (stats.isDirectory()) {
        parts.push({
          type: "file",
          url: pathToFileURL(filepath).href,
          filename: name,
          mime: "application/x-directory",
        })
        return
      }

      parts.push({
        type: "file",
        url: pathToFileURL(filepath).href,
        filename: name,
        mime: "text/plain",
      })
    }),
  )

  return { parts, fileCount: seen.size }
}

export const AskRoutes = lazy(() =>
  new Hono()
    .post(
      "/",
      describeRoute({
        summary: "Ask OpenCode",
        description:
          "Send a natural language question to OpenCode AI and get a structured analysis response. The AI will automatically select appropriate tools (grep, glob, read, etc.) to analyze the codebase.",
        operationId: "ask",
        responses: {
          200: {
            description: "Analysis result",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    result: z.string().describe("The AI's analysis result"),
                    sessionID: z.string().describe("Session ID for follow-up questions"),
                  }),
                ),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "json",
        z.object({
          query: z.string().describe("Natural language question about the codebase"),
          agent: z.string().optional().describe("Agent to use (default: explore)"),
        }),
      ),
      async (c) => {
        const body = c.req.valid("json")
        log.info("request received", { query: body.query.slice(0, 100), agent: body.agent })

        // Create a new session
        log.info("creating session")
        const session = await Session.create({
          title: `Ask: ${body.query.slice(0, 50)}...`,
        })
        log.info("session created", { sessionID: session.id })

        // Get model config
        log.info("getting model config")
        const config = await Config.get()
        const model = config.model
          ? Provider.parseModel(config.model)
          : await Provider.defaultModel()

        if (!model) {
          log.error("no model configured")
          return c.json({ error: "No model configured" }, 400)
        }
        log.info("model selected", { model: model.modelID })

        // Resolve file references in query (supports @path/to/file syntax)
        log.info("resolving file references")
        const { parts, fileCount } = await resolveFileReferences(body.query)
        if (fileCount > 0) {
          log.info("files attached", { count: fileCount })
        }

        // Determine agent
        const agentName = body.agent ?? "explore"

        // Send the prompt
        log.info("sending prompt", { agent: agentName, partsCount: parts.length })
        const result = await SessionPrompt.prompt({
          sessionID: session.id,
          model,
          agent: agentName,
          parts,
        })
        log.info("prompt completed", { partsCount: result.parts.length })

        // Extract text from the response
        const textPart = result.parts.findLast((p) => p.type === "text")
        const resultText = textPart && textPart.type === "text" ? textPart.text : ""

        log.info("request completed", { sessionID: session.id, resultLength: resultText.length })
        return c.json({
          result: resultText,
          sessionID: session.id,
        })
      },
    )
    .post(
      "/:sessionID/follow-up",
      describeRoute({
        summary: "Follow-up question",
        description: "Ask a follow-up question in an existing session to continue the conversation.",
        operationId: "ask.followUp",
        responses: {
          200: {
            description: "Follow-up result",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    result: z.string(),
                    sessionID: z.string(),
                  }),
                ),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().describe("Existing session ID"),
        }),
      ),
      validator(
        "json",
        z.object({
          query: z.string().describe("Follow-up question"),
        }),
      ),
      async (c) => {
        const params = c.req.valid("param")
        const body = c.req.valid("json")
        log.info("follow-up request received", { sessionID: params.sessionID, query: body.query.slice(0, 100) })

        // Verify session exists
        log.info("verifying session")
        const session = await Session.get(params.sessionID)
        log.info("session verified", { sessionID: session.id })

        // Get model config
        log.info("getting model config")
        const config = await Config.get()
        const model = config.model
          ? Provider.parseModel(config.model)
          : await Provider.defaultModel()

        if (!model) {
          log.error("no model configured")
          return c.json({ error: "No model configured" }, 400)
        }
        log.info("model selected", { model: model.modelID })

        // Resolve file references in query
        log.info("resolving file references")
        const { parts, fileCount } = await resolveFileReferences(body.query)
        if (fileCount > 0) {
          log.info("files attached", { count: fileCount })
        }

        // Send the follow-up prompt
        log.info("sending follow-up prompt", { partsCount: parts.length })
        const result = await SessionPrompt.prompt({
          sessionID: session.id,
          model,
          agent: "explore",
          parts,
        })
        log.info("prompt completed", { partsCount: result.parts.length })

        // Extract text from the response
        const textPart = result.parts.findLast((p) => p.type === "text")
        const resultText = textPart && textPart.type === "text" ? textPart.text : ""

        log.info("follow-up completed", { sessionID: session.id, resultLength: resultText.length })
        return c.json({
          result: resultText,
          sessionID: session.id,
        })
      },
    ),
)
