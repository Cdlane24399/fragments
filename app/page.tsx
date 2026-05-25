"use client";

import { experimental_useObject as useObject } from "@ai-sdk/react";
import type { DeepPartial } from "ai";
import { usePostHog } from "posthog-js/react";
import { useEffect, useState } from "react";
import { useLocalStorage } from "usehooks-ts";
import { AuthDialog } from "@/components/auth-dialog";
import { Chat } from "@/components/chat";
import { ChatInput } from "@/components/chat-input";
import { ChatPicker } from "@/components/chat-picker";
import { ChatSettings } from "@/components/chat-settings";
import { ChatSidebar } from "@/components/chat-sidebar";
import { NavBar } from "@/components/navbar";
import { Preview } from "@/components/preview";
import type { AuthViewType } from "@/lib/auth";
import { useAuth } from "@/lib/auth";
import {
  type ChatSession,
  createChatId,
  deleteChat as deleteChatFromStorage,
  generateChatTitle,
  loadChats,
  saveChat,
} from "@/lib/chat-history";
import type { Message } from "@/lib/messages";
import { toAISDKMessages, toMessageImage } from "@/lib/messages";
import { MODEL_PROVIDERS } from "@/lib/model-providers";
import type { LLMModel, LLMModelConfig } from "@/lib/models";
import type { FragmentSchema } from "@/lib/schema";
import { fragmentSchema as schema } from "@/lib/schema";
import { supabase } from "@/lib/supabase";
import type { TemplateId } from "@/lib/templates";
import templates from "@/lib/templates";
import type { ExecutionResult } from "@/lib/types";

type ModelsResponse = {
	models?: LLMModel[];
	statuses?: Array<{
		configured?: boolean;
		error?: string;
	}>;
};

export default function Home() {
	const [chatInput, setChatInput] = useLocalStorage("chat", "", {
		initializeWithValue: false,
	});
	const [files, setFiles] = useState<File[]>([]);
	const [selectedTemplate, setSelectedTemplate] = useState<"auto" | TemplateId>(
		"auto",
	);
	const [languageModel, setLanguageModel] = useLocalStorage<LLMModelConfig>(
		"languageModel",
		{},
		{ initializeWithValue: false },
	);
	const [providerApiKeys, setProviderApiKeys] = useLocalStorage<
		Record<string, string>
	>("providerApiKeys", {}, { initializeWithValue: false });

	const posthog = usePostHog();

	const [result, setResult] = useState<ExecutionResult>();
	const [messages, setMessages] = useState<Message[]>([]);
	const [fragment, setFragment] = useState<DeepPartial<FragmentSchema>>();
	const [currentTab, setCurrentTab] = useState<"code" | "fragment">("code");
	const [isPreviewLoading, setIsPreviewLoading] = useState(false);
	const [isAuthDialogOpen, setAuthDialog] = useState(false);
	const [authView, setAuthView] = useState<AuthViewType>("sign_in");
	const [isRateLimited, setIsRateLimited] = useState(false);
	const [models, setModels] = useState<LLMModel[]>([]);
	const [isLoadingModels, setIsLoadingModels] = useState(true);
	const [modelLoadError, setModelLoadError] = useState<string>();
	const { session, apiKey } = useAuth(setAuthDialog, setAuthView);

	const [chats, setChats] = useState<ChatSession[]>([]);
	const [activeChatId, setActiveChatId] = useState<string | null>(null);
	const [sidebarOpen, setSidebarOpen] = useState(false);

	// Load chat history on mount
	useEffect(() => {
		setChats(loadChats());
	}, []);

	// Autosave current chat whenever messages change
	useEffect(() => {
		if (messages.length === 0) return;
		const id = activeChatId || createChatId();
		if (!activeChatId) {
			setActiveChatId(id);
		}
		const session: ChatSession = {
			id,
			title: generateChatTitle(messages),
			messages,
			timestamp: Date.now(),
			fragment,
			result,
		};
		saveChat(session);
		setChats((prev) => {
			const index = prev.findIndex((c) => c.id === id);
			if (index >= 0) {
				const next = [...prev];
				next[index] = session;
				return next;
			}
			return [...prev, session];
		});
	}, [activeChatId, messages, fragment, result]);

	function handleSelectChat(chat: ChatSession) {
		setMessages(chat.messages);
		setFragment(chat.fragment);
		setResult(chat.result as ExecutionResult | undefined);
		setActiveChatId(chat.id);
		if (chat.fragment) {
			setCurrentTab("fragment");
		} else {
			setCurrentTab("code");
		}
		setChatInput("");
		setFiles([]);
	}

	function handleNewChat() {
		stop();
		setChatInput("");
		setFiles([]);
		setMessages([]);
		setFragment(undefined);
		setResult(undefined);
		setCurrentTab("code");
		setIsPreviewLoading(false);
		setActiveChatId(null);
	}

	function handleDeleteChat(id: string) {
		deleteChatFromStorage(id);
		setChats((prev) => prev.filter((c) => c.id !== id));
		if (activeChatId === id) {
			handleNewChat();
		}
	}

	const currentModel = models.find((model) => model.id === languageModel.model);
	const currentTemplate =
		selectedTemplate === "auto"
			? templates
			: { [selectedTemplate]: templates[selectedTemplate] };

	const { object, submit, isLoading, stop, error } = useObject({
		api: "/api/chat",
		schema,
		onError: (error: Error) => {
			if (error.message.includes("request limit")) {
				setIsRateLimited(true);
			}
		},
		onFinish: async ({
			object: fragment,
			error,
		}: {
			object: DeepPartial<FragmentSchema> | undefined;
			error: Error | undefined;
		}) => {
			if (!error) {
				// send it to /api/sandbox
				console.log("fragment", fragment);
				setIsPreviewLoading(true);
				posthog.capture("fragment_generated", {
					template: fragment?.template,
				});

				const response = await fetch("/api/sandbox", {
					method: "POST",
					body: JSON.stringify({
						fragment,
						userID: session?.user?.id,
						apiKey,
					}),
				});

				const result = await response.json();
				console.log("result", result);
				posthog.capture("sandbox_created", { url: result.url });

				setResult(result);
				setCurrentPreview({ fragment, result });
				setMessage({ result });
				setCurrentTab("fragment");
				setIsPreviewLoading(false);
			}
		},
	});

	useEffect(() => {
		const controller = new AbortController();
		const timeout = setTimeout(async () => {
			setIsLoadingModels(true);

			try {
				const response = await fetch("/api/models", {
					method: "POST",
					body: JSON.stringify({
						apiKeys: providerApiKeys,
						baseURL: languageModel.baseURL,
					}),
					signal: controller.signal,
				});

				if (!response.ok) {
					throw new Error("Unable to load models");
				}

				const data = (await response.json()) as ModelsResponse;
				const configuredErrors = (data.statuses ?? []).filter(
					(status) => status.configured && status.error,
				);

				setModels(data.models ?? []);
				setModelLoadError(
					configuredErrors.length > 0
						? "Some configured providers could not return models."
						: undefined,
				);
			} catch (error) {
				if (!controller.signal.aborted) {
					setModels([]);
					setModelLoadError(
						error instanceof Error ? error.message : "Unable to load models",
					);
				}
			} finally {
				if (!controller.signal.aborted) {
					setIsLoadingModels(false);
				}
			}
		}, 400);

		return () => {
			clearTimeout(timeout);
			controller.abort();
		};
	}, [providerApiKeys, languageModel.baseURL]);

	useEffect(() => {
		if (models.length === 0) return;
		if (
			languageModel.model &&
			models.some((model) => model.id === languageModel.model)
		) {
			return;
		}

		setLanguageModel({ ...languageModel, model: models[0].id });
	}, [models, languageModel, setLanguageModel]);

	useEffect(() => {
		if (!object) return;

		setFragment(object);
		const content: Message["content"] = [
			{ type: "text", text: object.commentary || "" },
			{ type: "code", text: object.code || "" },
		];

		setMessages((previousMessages) => {
			const lastIndex = previousMessages.length - 1;
			const lastMessage = previousMessages[lastIndex];

			if (lastMessage?.role === "assistant") {
				const updatedMessages = [...previousMessages];
				updatedMessages[lastIndex] = {
					...lastMessage,
					content,
					object,
				};
				return updatedMessages;
			}

			return [...previousMessages, { role: "assistant", content, object }];
		});
	}, [object]);

	useEffect(() => {
		if (error) stop();
	}, [error, stop]);

	function setMessage(message: Partial<Message>, index?: number) {
		setMessages((previousMessages) => {
			const updatedMessages = [...previousMessages];
			updatedMessages[index ?? previousMessages.length - 1] = {
				...previousMessages[index ?? previousMessages.length - 1],
				...message,
			};

			return updatedMessages;
		});
	}

	async function handleSubmitAuth(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();

		if (!session) {
			return setAuthDialog(true);
		}

		if (isLoading) {
			stop();
		}

		if (!currentModel) {
			setModelLoadError("Add an API key and select a returned model first.");
			return;
		}

		const content: Message["content"] = [{ type: "text", text: chatInput }];
		const images = await toMessageImage(files);

		if (images.length > 0) {
			images.forEach((image) => {
				content.push({ type: "image", image });
			});
		}

		const updatedMessages = addMessage({
			role: "user",
			content,
		});

		submit({
			userID: session?.user?.id,
			messages: toAISDKMessages(updatedMessages),
			template: currentTemplate,
			model: currentModel,
			config: getRequestModelConfig(),
		});

		setChatInput("");
		setFiles([]);
		setCurrentTab("code");

		posthog.capture("chat_submit", {
			template: selectedTemplate,
			model: languageModel.model,
		});
	}

	function retry() {
		if (!currentModel) {
			setModelLoadError("Add an API key and select a returned model first.");
			return;
		}

		submit({
			userID: session?.user?.id,
			messages: toAISDKMessages(messages),
			template: currentTemplate,
			model: currentModel,
			config: getRequestModelConfig(),
		});
	}

	function addMessage(message: Message) {
		setMessages((previousMessages) => [...previousMessages, message]);
		return [...messages, message];
	}

	function handleSaveInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
		setChatInput(e.target.value);
	}

	function logout() {
		supabase
			? supabase.auth.signOut()
			: console.warn("Supabase is not initialized");
	}

	function handleLanguageModelChange(e: LLMModelConfig) {
		setLanguageModel({ ...languageModel, ...e });
	}

	function getRequestModelConfig() {
		const providerApiKey = currentModel?.providerId
			? providerApiKeys[currentModel.providerId]
			: undefined;

		return {
			...languageModel,
			apiKey: providerApiKey || languageModel.apiKey,
		};
	}

	function handleSocialClick(target: "github" | "x" | "discord") {
		if (target === "github") {
			window.open("https://github.com/e2b-dev/fragments", "_blank");
		} else if (target === "x") {
			window.open("https://x.com/e2b_dev", "_blank");
		} else if (target === "discord") {
			window.open("https://discord.gg/U7KEcGErtQ", "_blank");
		}

		posthog.capture(`${target}_click`);
	}

	function handleClearChat() {
		stop();
		setChatInput("");
		setFiles([]);
		setMessages([]);
		setFragment(undefined);
		setResult(undefined);
		setCurrentTab("code");
		setIsPreviewLoading(false);
	}

	function setCurrentPreview(preview: {
		fragment: DeepPartial<FragmentSchema> | undefined;
		result: ExecutionResult | undefined;
	}) {
		setFragment(preview.fragment);
		setResult(preview.result);
	}

	function handleUndo() {
		setMessages((previousMessages) => [...previousMessages.slice(0, -2)]);
		setCurrentPreview({ fragment: undefined, result: undefined });
	}

	return (
		<main className="flex min-h-screen max-h-screen">
			{supabase && (
				<AuthDialog
					open={isAuthDialogOpen}
					setOpen={setAuthDialog}
					view={authView}
					supabase={supabase}
				/>
			)}
			<div className="flex w-full">
				<ChatSidebar
					chats={chats}
					activeChatId={activeChatId}
					onSelectChat={handleSelectChat}
					onDeleteChat={handleDeleteChat}
					onNewChat={handleNewChat}
					isOpen={sidebarOpen}
					onToggle={() => setSidebarOpen(!sidebarOpen)}
				/>
				<div className="grid flex-1 md:grid-cols-2 min-w-0">
					<div
						className={`flex flex-col w-full max-h-full max-w-[800px] mx-auto px-4 overflow-auto ${fragment ? "col-span-1" : "col-span-2"}`}
					>
						<NavBar
							session={session}
							showLogin={() => setAuthDialog(true)}
							signOut={logout}
							onSocialClick={handleSocialClick}
							onClear={handleClearChat}
							canClear={messages.length > 0}
							canUndo={messages.length > 1 && !isLoading}
							onUndo={handleUndo}
						/>
						<Chat
							messages={messages}
							isLoading={isLoading}
							setCurrentPreview={setCurrentPreview}
						/>
						<ChatInput
							retry={retry}
							isErrored={error !== undefined}
							isLoading={isLoading}
							isRateLimited={isRateLimited}
							stop={stop}
							input={chatInput}
							handleInputChange={handleSaveInputChange}
							handleSubmit={handleSubmitAuth}
							isMultiModal={currentModel?.multiModal || false}
							files={files}
							handleFileChange={setFiles}
						>
							<ChatPicker
								templates={templates}
								selectedTemplate={selectedTemplate}
								onSelectedTemplateChange={setSelectedTemplate}
								models={models}
								languageModel={languageModel}
								isLoadingModels={isLoadingModels}
								onLanguageModelChange={handleLanguageModelChange}
							/>
							<ChatSettings
								models={models}
								providers={MODEL_PROVIDERS}
								languageModel={languageModel}
								providerApiKeys={providerApiKeys}
								isLoadingModels={isLoadingModels}
								modelLoadError={modelLoadError}
								onLanguageModelChange={handleLanguageModelChange}
								onProviderApiKeysChange={setProviderApiKeys}
								apiKeyConfigurable={!process.env.NEXT_PUBLIC_NO_API_KEY_INPUT}
								baseURLConfigurable={!process.env.NEXT_PUBLIC_NO_BASE_URL_INPUT}
							/>
						</ChatInput>
					</div>
				<Preview
					apiKey={apiKey}
					selectedTab={currentTab}
					onSelectedTabChange={setCurrentTab}
					isChatLoading={isLoading}
					isPreviewLoading={isPreviewLoading}
					fragment={fragment}
					result={result as ExecutionResult}
					onClose={() => setFragment(undefined)}
				/>
			</div>
			</div>
		</main>
	);
}
