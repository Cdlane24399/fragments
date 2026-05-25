import { KeyRound, Settings2, Trash2 } from "lucide-react";
import type { ModelProvider } from "@/lib/model-providers";
import type { LLMModel, LLMModelConfig } from "@/lib/models";
import { Button } from "./ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "./ui/select";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "./ui/tooltip";

type ProviderApiKeys = Record<string, string>;

function parseNumber(value: string) {
	return value.length > 0 ? parseFloat(value) : undefined;
}

function groupModelsByProvider(models: LLMModel[]) {
	return models.reduce<Record<string, LLMModel[]>>((groups, model) => {
		groups[model.provider] = groups[model.provider] || [];
		groups[model.provider].push(model);
		return groups;
	}, {});
}

export function ChatSettings({
	apiKeyConfigurable,
	baseURLConfigurable,
	models,
	providers,
	languageModel,
	providerApiKeys,
	isLoadingModels,
	modelLoadError,
	onLanguageModelChange,
	onProviderApiKeysChange,
}: {
	apiKeyConfigurable: boolean;
	baseURLConfigurable: boolean;
	models: LLMModel[];
	providers: ModelProvider[];
	languageModel: LLMModelConfig;
	providerApiKeys: ProviderApiKeys;
	isLoadingModels: boolean;
	modelLoadError: string | undefined;
	onLanguageModelChange: (model: LLMModelConfig) => void;
	onProviderApiKeysChange: (keys: ProviderApiKeys) => void;
}) {
	const selectedModel = models.find(
		(model) => model.id === languageModel.model,
	);
	const apiKeyProviders = providers.filter((provider) => provider.envVar);
	const savedKeyCount = Object.values(providerApiKeys).filter(Boolean).length;

	function setProviderApiKey(providerId: string, value: string) {
		const nextKeys = { ...providerApiKeys };

		if (value.length > 0) {
			nextKeys[providerId] = value;
		} else {
			delete nextKeys[providerId];
		}

		onProviderApiKeysChange(nextKeys);
	}

	function clearProviderApiKey(providerId: string) {
		const nextKeys = { ...providerApiKeys };
		delete nextKeys[providerId];
		onProviderApiKeysChange(nextKeys);
	}

	return (
		<Dialog>
			<TooltipProvider>
				<Tooltip delayDuration={0}>
					<DialogTrigger asChild>
						<TooltipTrigger asChild>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								aria-label="LLM settings"
								className="text-muted-foreground h-6 w-6 rounded-sm"
							>
								<Settings2 className="h-4 w-4" />
							</Button>
						</TooltipTrigger>
					</DialogTrigger>
					<TooltipContent>LLM settings</TooltipContent>
				</Tooltip>
			</TooltipProvider>
			<DialogContent className="h-auto max-h-[85vh] max-w-2xl overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Model and API keys</DialogTitle>
					<DialogDescription>
						{selectedModel
							? `${selectedModel.provider} · ${selectedModel.name}`
							: "Add an API key to load available models."}
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-5">
					<div className="grid gap-2">
						<Label htmlFor="languageModel">Model</Label>
						<Select
							name="languageModel"
							value={languageModel.model ?? ""}
							disabled={models.length === 0}
							onValueChange={(model) => onLanguageModelChange({ model })}
						>
							<SelectTrigger id="languageModel">
								<SelectValue
									placeholder={
										isLoadingModels ? "Loading models..." : "No models loaded"
									}
								/>
							</SelectTrigger>
							<SelectContent className="max-h-[360px]">
								{Object.entries(groupModelsByProvider(models)).map(
									([provider, providerModels]) => (
										<SelectGroup key={provider}>
											<SelectLabel>{provider}</SelectLabel>
											{providerModels.map((model) => (
												<SelectItem key={model.id} value={model.id}>
													{model.name}
												</SelectItem>
											))}
										</SelectGroup>
									),
								)}
							</SelectContent>
						</Select>
						{modelLoadError && (
							<p className="text-xs text-destructive">{modelLoadError}</p>
						)}
					</div>

					{apiKeyConfigurable && (
						<div className="grid gap-3">
							<div className="flex items-center justify-between gap-2">
								<div className="flex items-center gap-2">
									<KeyRound className="h-4 w-4 text-muted-foreground" />
									<span className="text-sm font-medium">API keys</span>
								</div>
								<span className="text-xs text-muted-foreground">
									{savedKeyCount} saved
								</span>
							</div>
							<div className="grid gap-3 md:grid-cols-2">
								{apiKeyProviders.map((provider) => (
									<div key={provider.id} className="grid gap-1.5">
										<div className="flex items-center justify-between gap-2">
											<Label htmlFor={`api-key-${provider.id}`}>
												{provider.name}
											</Label>
											{selectedModel?.providerId === provider.id && (
												<span className="text-xs text-muted-foreground">
													Current
												</span>
											)}
										</div>
										<div className="flex gap-2">
											<Input
												id={`api-key-${provider.id}`}
												name={`api-key-${provider.id}`}
												type="password"
												autoComplete="off"
												placeholder={provider.envVar}
												value={providerApiKeys[provider.id] || ""}
												onChange={(event) =>
													setProviderApiKey(provider.id, event.target.value)
												}
												className="text-sm"
											/>
											<TooltipProvider>
												<Tooltip delayDuration={0}>
													<TooltipTrigger asChild>
														<Button
															type="button"
															variant="outline"
															size="icon"
															disabled={!providerApiKeys[provider.id]}
															onClick={() => clearProviderApiKey(provider.id)}
														>
															<Trash2 className="h-4 w-4" />
														</Button>
													</TooltipTrigger>
													<TooltipContent>Remove key</TooltipContent>
												</Tooltip>
											</TooltipProvider>
										</div>
									</div>
								))}
							</div>
						</div>
					)}

					{baseURLConfigurable && (
						<div className="grid gap-2">
							<Label htmlFor="baseURL">Base URL</Label>
							<Input
								id="baseURL"
								name="baseURL"
								type="text"
								placeholder="Auto"
								value={languageModel.baseURL || ""}
								onChange={(e) =>
									onLanguageModelChange({
										baseURL:
											e.target.value.length > 0 ? e.target.value : undefined,
									})
								}
								className="text-sm"
							/>
						</div>
					)}

					<div className="grid gap-2">
						<span className="text-sm font-medium">Parameters</span>
						<div className="flex items-center gap-4">
							<span className="text-sm flex-1 text-muted-foreground">
								Output tokens
							</span>
							<Input
								type="number"
								value={languageModel.maxTokens ?? ""}
								min={50}
								max={10000}
								step={1}
								className="h-6 rounded-sm w-[84px] text-xs text-center tabular-nums"
								placeholder="Auto"
								onChange={(e) =>
									onLanguageModelChange({
										maxTokens: parseNumber(e.target.value),
									})
								}
							/>
						</div>
						<div className="flex items-center gap-4">
							<span className="text-sm flex-1 text-muted-foreground">
								Temperature
							</span>
							<Input
								type="number"
								value={languageModel.temperature ?? ""}
								min={0}
								max={5}
								step={0.01}
								className="h-6 rounded-sm w-[84px] text-xs text-center tabular-nums"
								placeholder="Auto"
								onChange={(e) =>
									onLanguageModelChange({
										temperature: parseNumber(e.target.value),
									})
								}
							/>
						</div>
						<div className="flex items-center gap-4">
							<span className="text-sm flex-1 text-muted-foreground">
								Top P
							</span>
							<Input
								type="number"
								value={languageModel.topP ?? ""}
								min={0}
								max={1}
								step={0.01}
								className="h-6 rounded-sm w-[84px] text-xs text-center tabular-nums"
								placeholder="Auto"
								onChange={(e) =>
									onLanguageModelChange({
										topP: parseNumber(e.target.value),
									})
								}
							/>
						</div>
						<div className="flex items-center gap-4">
							<span className="text-sm flex-1 text-muted-foreground">
								Top K
							</span>
							<Input
								type="number"
								value={languageModel.topK ?? ""}
								min={0}
								max={500}
								step={1}
								className="h-6 rounded-sm w-[84px] text-xs text-center tabular-nums"
								placeholder="Auto"
								onChange={(e) =>
									onLanguageModelChange({
										topK: parseNumber(e.target.value),
									})
								}
							/>
						</div>
						<div className="flex items-center gap-4">
							<span className="text-sm flex-1 text-muted-foreground">
								Frequency penalty
							</span>
							<Input
								type="number"
								value={languageModel.frequencyPenalty ?? ""}
								min={0}
								max={2}
								step={0.01}
								className="h-6 rounded-sm w-[84px] text-xs text-center tabular-nums"
								placeholder="Auto"
								onChange={(e) =>
									onLanguageModelChange({
										frequencyPenalty: parseNumber(e.target.value),
									})
								}
							/>
						</div>
						<div className="flex items-center gap-4">
							<span className="text-sm flex-1 text-muted-foreground">
								Presence penalty
							</span>
							<Input
								type="number"
								value={languageModel.presencePenalty ?? ""}
								min={0}
								max={2}
								step={0.01}
								className="h-6 rounded-sm w-[84px] text-xs text-center tabular-nums"
								placeholder="Auto"
								onChange={(e) =>
									onLanguageModelChange({
										presencePenalty: parseNumber(e.target.value),
									})
								}
							/>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
