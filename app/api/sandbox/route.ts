import { Sandbox } from "@e2b/code-interpreter";
import type { FragmentSchema } from "@/lib/schema";
import type {
	ExecutionResultInterpreter,
	ExecutionResultWeb,
} from "@/lib/types";

const sandboxTimeout = 10 * 60 * 1000; // 10 minute in ms
const sandboxProjectRoot = "/home/user/project";

export const maxDuration = 60;

type FragmentFile = {
	file_path: string;
	file_content: string;
};

function getFragmentFiles(fragment: FragmentSchema) {
	if (Array.isArray(fragment.code)) return fragment.code as FragmentFile[];
	if (!fragment.code) return [];

	return [
		{
			file_path: fragment.file_path,
			file_content: fragment.code,
		},
	];
}

function getSandboxFiles(fragment: FragmentSchema) {
	const files = getFragmentFiles(fragment);

	if (fragment.template !== "nextjs-developer") return files;

	const pageFile =
		files.find((file) => file.file_path === "app/page.tsx") ||
		files.find((file) => file.file_path === "pages/index.tsx");

	if (!pageFile) return files;
	if (pageFile.file_path === "app/page.tsx") return files;

	return [
		...files.filter((file) => file.file_path !== "pages/index.tsx"),
		{
			file_path: "app/page.tsx",
			file_content: pageFile.file_content,
		},
	];
}

function getSandboxPath(fragment: FragmentSchema, filePath: string) {
	if (fragment.template === "nextjs-developer") {
		return `${sandboxProjectRoot}/${filePath}`;
	}

	return filePath;
}

export async function POST(req: Request) {
	let fragment: FragmentSchema;
	let userID: string;
	let apiKey: string | undefined;

	try {
		const body = (await req.json()) as {
			fragment: FragmentSchema;
			userID: string;
			apiKey?: string;
		};
		fragment = body.fragment;
		userID = body.userID;
		apiKey = body.apiKey;
	} catch (err) {
		return Response.json(
			{ error: "Invalid JSON body", detail: (err as Error).message },
			{ status: 400 },
		);
	}

	console.log("fragment", fragment);
	console.log("userID", userID);

	try {
		// Create an interpreter or a sandbox
		const sbx = await Sandbox.create(fragment.template, {
			metadata: { template: fragment.template, userID: userID },
			timeoutMs: sandboxTimeout,
			apiKey,
		});

		// Install packages
		if (fragment.has_additional_dependencies) {
			await sbx.commands.run(fragment.install_dependencies_command);
			console.log(
				`Installed dependencies: ${fragment.additional_dependencies.join(", ")} in sandbox ${sbx.sandboxId}`,
			);
		}

		// Copy code to fs. The deployed nextjs-developer sandbox currently has an
		// App Router page at `/`, so mirror generated `pages/index.tsx` fragments
		// into `app/page.tsx` as well. That keeps the code tab's generated file
		// path intact while making the preview route serve the generated component.
		for (const file of getSandboxFiles(fragment)) {
			await sbx.files.write(
				getSandboxPath(fragment, file.file_path),
				file.file_content,
			);
			console.log(`Copied file to ${file.file_path} in ${sbx.sandboxId}`);
		}

		if (fragment.template === "nextjs-developer") {
			await sbx.commands.run("touch /tmp/fragments-ready");
			console.log(`Started Next.js dev server in ${sbx.sandboxId}`);
		}

		// Execute code or return a URL to the running sandbox
		if (fragment.template === "code-interpreter-v1") {
			const { logs, error, results } = await sbx.runCode(fragment.code || "");

			return Response.json({
				sbxId: sbx?.sandboxId,
				template: fragment.template,
				stdout: logs.stdout,
				stderr: logs.stderr,
				runtimeError: error,
				cellResults: results,
			} as ExecutionResultInterpreter);
		}

		// Warm the dev server so Turbopack/webpack compiles the freshly written
		// entry file before we hand the URL back to the client. Without this, the
		// browser races the compile and renders the stale page baked into the
		// sandbox snapshot (e.g. the default Next.js welcome page).
		if (fragment.port) {
			try {
				const response = await sbx.commands.run(
					`for i in $(seq 1 30); do html=$(curl -sS --fail --max-time 5 http://localhost:${fragment.port}/) && ! printf '%s' "$html" | grep -Eiq 'To get started|page\\.tsx file|app/page\\.tsx' && { printf '%s' "$html"; exit 0; }; sleep 1; done; exit 22`,
					{ timeoutMs: 40_000 },
				);

				if (/To get started|app\/page\.tsx/i.test(response.stdout)) {
					throw new Error(
						"Sandbox preview is still serving the default Next.js page",
					);
				}
			} catch (warmErr) {
				throw new Error(
					`Sandbox preview failed to serve generated code: ${(warmErr as Error).message}`,
				);
			}
		}

		return Response.json({
			sbxId: sbx?.sandboxId,
			template: fragment.template,
			url: `https://${sbx?.getHost(fragment.port || 80)}`,
		} as ExecutionResultWeb);
	} catch (err) {
		const error = err as Error;
		console.error("Sandbox error:", error);
		return Response.json(
			{
				error: "Sandbox creation/execution failed",
				message: error.message,
				cause: (error as Error & { cause?: { message?: string } }).cause
					?.message,
			},
			{ status: 500 },
		);
	}
}
