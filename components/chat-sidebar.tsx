"use client";

import { MessageSquare, PanelLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ChatSession } from "@/lib/chat-history";
import { cn } from "@/lib/utils";

interface ChatSidebarProps {
	chats: ChatSession[];
	activeChatId: string | null;
	onSelectChat: (chat: ChatSession) => void;
	onDeleteChat: (id: string) => void;
	onNewChat: () => void;
	isOpen: boolean;
	onToggle: () => void;
}

export function ChatSidebar({
	chats,
	activeChatId,
	onSelectChat,
	onDeleteChat,
	onNewChat,
	isOpen,
	onToggle,
}: ChatSidebarProps) {
	function formatDate(timestamp: number) {
		const date = new Date(timestamp);
		const now = new Date();
		const diff = now.getTime() - date.getTime();
		const days = Math.floor(diff / (1000 * 60 * 60 * 24));

		if (days === 0) return "Today";
		if (days === 1) return "Yesterday";
		if (days < 7) return `${days} days ago`;
		return date.toLocaleDateString();
	}

	return (
		<>
			{/* Toggle button - always visible */}
			<div
				className={cn(
					"flex-shrink-0 flex items-start pt-4 px-1",
					isOpen ? "justify-end" : "justify-center",
				)}
			>
				<TooltipProvider>
					<Tooltip delayDuration={0}>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								onClick={onToggle}
								className="h-8 w-8"
							>
								<PanelLeft
									className={cn(
										"h-4 w-4 transition-transform",
										isOpen ? "" : "rotate-180",
									)}
								/>
							</Button>
						</TooltipTrigger>
						<TooltipContent side="right">
							{isOpen ? "Close sidebar" : "Open sidebar"}
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			</div>

			{/* Sidebar panel */}
			<div
				className={cn(
					"flex flex-col h-full bg-background border-r overflow-hidden transition-all duration-300 ease-in-out",
					isOpen ? "w-72" : "w-0 border-r-0",
				)}
			>
				<div className="flex flex-col h-full w-72">
					{/* Header */}
					<div className="flex items-center justify-between px-3 py-3">
						<span className="text-sm font-semibold text-foreground">Chats</span>
						<TooltipProvider>
							<Tooltip delayDuration={0}>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										onClick={onNewChat}
										className="h-7 w-7"
									>
										<Plus className="h-4 w-4" />
									</Button>
								</TooltipTrigger>
								<TooltipContent>New chat</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					</div>

					<Separator />

					{/* Chat list */}
					<div className="flex-1 overflow-y-auto py-1">
						{chats.length === 0 ? (
							<p className="text-xs text-muted-foreground text-center py-8 px-4">
								No chats yet. Start a conversation!
							</p>
						) : (
							chats
								.sort((a, b) => b.timestamp - a.timestamp)
								.map((chat) => (
									<div
										key={chat.id}
										className={cn(
											"w-full flex items-start gap-2 px-3 py-2.5 text-left group hover:bg-accent/50 transition-colors",
											activeChatId === chat.id && "bg-accent",
										)}
									>
										<button
											type="button"
											onClick={() => onSelectChat(chat)}
											className="flex flex-1 min-w-0 items-start gap-2 text-left"
										>
											<MessageSquare className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
											<div className="min-w-0">
												<p className="text-sm font-medium truncate">
													{chat.title}
												</p>
												<p className="text-xs text-muted-foreground">
													{formatDate(chat.timestamp)}
												</p>
											</div>
										</button>
										<TooltipProvider>
											<Tooltip delayDuration={0}>
												<TooltipTrigger asChild>
													<Button
														variant="ghost"
														size="icon"
														className="h-6 w-6 opacity-0 group-hover:opacity-100 flex-shrink-0"
														onClick={() => onDeleteChat(chat.id)}
													>
														<Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
													</Button>
												</TooltipTrigger>
												<TooltipContent>Delete chat</TooltipContent>
											</Tooltip>
										</TooltipProvider>
									</div>
								))
						)}
					</div>
				</div>
			</div>
		</>
	);
}
