import { Sparkles } from "lucide-react";
import Image from "next/image";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { LLMModel, LLMModelConfig } from "@/lib/models";
import type { TemplateId, Templates } from "@/lib/templates";

function groupModelsByProvider(models: LLMModel[]) {
	return models.reduce<Record<string, LLMModel[]>>((groups, model) => {
		groups[model.provider] = groups[model.provider] || [];
		groups[model.provider].push(model);
		return groups;
	}, {});
}

export function ChatPicker({
	templates,
	selectedTemplate,
	onSelectedTemplateChange,
	models,
	languageModel,
	isLoadingModels,
	onLanguageModelChange,
}: {
	templates: Templates;
	selectedTemplate: "auto" | TemplateId;
	onSelectedTemplateChange: (template: "auto" | TemplateId) => void;
	models: LLMModel[];
	languageModel: LLMModelConfig;
	isLoadingModels: boolean;
	onLanguageModelChange: (config: LLMModelConfig) => void;
}) {
	return (
		<div className="flex items-center space-x-2">
			<div className="flex flex-col">
				<Select
					name="template"
					value={selectedTemplate}
					onValueChange={onSelectedTemplateChange}
				>
					<SelectTrigger className="whitespace-nowrap border-none shadow-none focus:ring-0 px-0 py-0 h-6 text-xs">
						<SelectValue placeholder={selectedTemplate ? undefined : "Select a persona"} />
					</SelectTrigger>
					<SelectContent side="top">
						<SelectGroup>
							<SelectLabel>Persona</SelectLabel>
							<SelectItem value="auto">
								<div className="flex items-center space-x-2">
									<Sparkles
										className="flex text-[#a1a1aa]"
										width={14}
										height={14}
									/>
									<span>Auto</span>
								</div>
							</SelectItem>
							{Object.entries(templates).map(([templateId, template]) => (
								<SelectItem key={templateId} value={templateId}>
									<div className="flex items-center space-x-2">
										<Image
											className="flex h-auto"
											src={`/thirdparty/templates/${templateId}.svg`}
											alt={templateId}
											width={14}
											height={14}
										/>
										<span>{template.name}</span>
									</div>
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
			</div>
			<div className="flex flex-col">
				<Select
					name="languageModel"
					value={languageModel.model ?? ""}
					disabled={models.length === 0}
					onValueChange={(e) => onLanguageModelChange({ model: e })}
				>
					<SelectTrigger className="whitespace-nowrap border-none shadow-none focus:ring-0 px-0 py-0 h-6 text-xs">
						<SelectValue>
							{languageModel.model
								? undefined
								: isLoadingModels
									? "Loading models"
									: "No models"}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{Object.entries(groupModelsByProvider(models)).map(
							([provider, models]) => (
								<SelectGroup key={provider}>
									<SelectLabel>{provider}</SelectLabel>
									{models?.map((model) => (
										<SelectItem key={model.id} value={model.id}>
											<div className="flex items-center space-x-2">
												<Image
													className="flex h-auto"
													src={`/thirdparty/logos/${model.providerId}.svg`}
													alt={model.provider}
													width={14}
													height={14}
												/>
												<span>{model.name}</span>
											</div>
										</SelectItem>
									))}
								</SelectGroup>
							),
						)}
					</SelectContent>
				</Select>
			</div>
		</div>
	);
}
