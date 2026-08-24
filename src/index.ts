#!/usr/bin/env node
// MCP server exposing KaiRouter's video generation API (BytePlus Seedance
// family and other video models) to agent harnesses over stdio.
//
// Config (environment variables):
//   KAIROUTER_API_KEY  required for generate_video / check_video_status / list_video_jobs.
//                       Create one at https://kairouter.com/dashboard/api-keys
//   KAIROUTER_API_URL  optional, defaults to https://kairouter.com

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { generateVideo, getVideoJob, isTerminalStatus, listVideoJobs, listVideoModels } from "./client.js";

const server = new McpServer({ name: "kairouter-mcp", version: "0.1.0" });

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function fail(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

server.registerTool(
  "list_video_models",
  {
    title: "List KaiRouter video models",
    description:
      "List the video generation models currently active on KaiRouter (BytePlus Seedance family and others), " +
      "with id, pricing, and live provider health. Call this first to find a valid model id for generate_video — " +
      "model availability changes over time, so don't assume a model id without checking here.",
  },
  async () => {
    try {
      return ok(await listVideoModels());
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  "generate_video",
  {
    title: "Generate a video with KaiRouter",
    description:
      "Start an async video generation job on KaiRouter (e.g. BytePlus Seedance 2.0 / 2.0 Fast / 2.0 Mini / " +
      "1.5 Pro / 1.0 Pro — see list_video_models for the exact ids currently available). Returns immediately " +
      "with a job id and status 'queued'; it does NOT wait for the video to finish. Call check_video_status " +
      "with the returned id to poll until status is 'succeeded' (or 'failed'). Deducts real credits from the " +
      "caller's KaiRouter account balance when the job is accepted.",
    inputSchema: {
      model: z
        .string()
        .describe("KaiRouter model id, e.g. 'dreamina-seedance-2-0-260128'. Call list_video_models to see valid ids."),
      prompt: z.string().describe("Text prompt describing the video to generate."),
      negative_prompt: z.string().optional().describe("Things to avoid in the output."),
      resolution: z.enum(["480p", "720p", "1080p", "4k"]).optional().describe("Output resolution. Default 720p."),
      duration: z.number().int().positive().optional().describe("Output duration in seconds. Default 5."),
      ratio: z.string().optional().describe("Aspect ratio, e.g. '16:9', '9:16', '1:1'. Default 16:9."),
      image_url: z.string().optional().describe("Reference image URL or data: URI, for image-to-video generation."),
      video_url: z.string().optional().describe("Input video URL, for video-to-video generation on models that support it."),
      input_duration_secs: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Duration in seconds of the input video — required for accurate cost estimation on video-to-video."),
      with_audio: z
        .boolean()
        .optional()
        .describe("Generate with audio, on models with audio-based pricing (e.g. Seedance 1.5 Pro)."),
    },
  },
  async (args) => {
    try {
      return ok(await generateVideo(args));
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  "check_video_status",
  {
    title: "Check a KaiRouter video job's status",
    description:
      "Poll the status of a video generation job started with generate_video. status is one of " +
      "'queued', 'processing', 'succeeded', 'failed'. Once status is 'succeeded', video_url has the finished " +
      "video. Poll every few seconds — generation typically takes tens of seconds to a few minutes depending " +
      "on model and resolution.",
    inputSchema: {
      job_id: z.string().describe("The job id returned by generate_video."),
    },
  },
  async ({ job_id }) => {
    try {
      return ok(await getVideoJob(job_id));
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  "wait_for_video_job",
  {
    title: "Wait for a KaiRouter video job to finish",
    description:
      "Poll a video generation job started with generate_video until it reaches a terminal " +
      "status ('succeeded', 'failed', 'cancelled', or 'expired') or the timeout elapses, then " +
      "return the final job. Use this instead of manually looping check_video_status calls when " +
      "you just want the finished result.",
    inputSchema: {
      job_id: z.string().describe("The job id returned by generate_video."),
      timeout_secs: z
        .number()
        .int()
        .positive()
        .max(1800)
        .optional()
        .describe("Max time to wait, in seconds. Default 300."),
      poll_interval_secs: z
        .number()
        .int()
        .positive()
        .max(60)
        .optional()
        .describe("Delay between polls, in seconds. Default 5."),
    },
  },
  async ({ job_id, timeout_secs, poll_interval_secs }) => {
    const deadline = Date.now() + (timeout_secs ?? 300) * 1000;
    const intervalMs = (poll_interval_secs ?? 5) * 1000;
    try {
      let job = await getVideoJob(job_id);
      while (!isTerminalStatus(job.status) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
        job = await getVideoJob(job_id);
      }
      return ok({ ...job, timed_out: !isTerminalStatus(job.status) });
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  "list_video_jobs",
  {
    title: "List recent KaiRouter video jobs",
    description:
      "List the caller's most recent video generation jobs (up to 50), most recent first. Useful for " +
      "recovering a job id that was lost, or reviewing recent generations.",
  },
  async () => {
    try {
      return ok(await listVideoJobs());
    } catch (err) {
      return fail(err);
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("kairouter-mcp: fatal error:", err);
  process.exit(1);
});
