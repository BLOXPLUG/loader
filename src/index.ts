import { ReplicatedStorage, RunService, ServerScriptService, StarterPlayer } from "@rbxts/services";

interface Loadable {
	onInit?(): undefined;
	onStart?(): undefined;
}


interface Importer {
	import: (script: LuaSourceContainer, module: ModuleScript) => Loadable;
}

export namespace Loader {
	/**
	* Loads module with the following structure
	* 
	* export default class MyModule {
	*     onInit() {} // This will be called immediately
	*     onStart() {} // This will be called in async after every onInit call is finished
	* }
	* 
	* ```
	*/
	export async function load({ paths }: { paths: string[];  }) {
		const importer = (_G as object)[script as never] as Importer
		const modules = Loader.getModules(paths);

		const startTime = os.clock();
		const preloaded = (await Promise.all(
			modules.mapFiltered(async (module) => {
				const [name, result] = preload(importer, module) || [];
				if (name !== undefined && result) {
					return [name, result] as const;
				}
			}),
		)) as readonly [string, Loadable][];

		for (const [name, module] of preloaded) {
			if (typeOf(module.onInit) === "function") {
				const [success, result] = pcall(() => module.onInit && module.onInit());
				if (!success) {
					warn(`Failed to initialize module: ${name}. Error: ${tostring(result)}`);
				}
			}
		}

		print(`${preloaded.size()} modules initialized in ${math.floor((os.clock() - startTime) * 1000)}ms`);

		for (const [name, module] of preloaded) {
			if (typeOf(module.onStart) === "function") {
				const [success, result] = pcall(() => module.onStart && module.onStart());
				if (!success) {
					warn(`Failed to start module: ${name}. Error: ${tostring(result)}`);
				}
			}
		}
	};

	function preload(importer: Importer, module: ModuleScript) {
		const [success, result] = pcall(() => {
			return importer ? importer.import(script, module) : require(module);
		}) as LuaTuple<[boolean, Loadable | { default: Loadable } | undefined]>;

		if (!success) {
			warn(`Failed to preload module: ${module.Name}. Error: ${tostring(result)}`);
			return;
		}

		const classInstance = "default" in result! ? result!.default : result;
		if (type(getmetatable(classInstance!)) !== "table") {
			warn(`did not recognize ${module} as a service/controller!`);
			return;
		}

		return [module.Name, classInstance];
	}

	export function getModules(paths: string[]) {
		return [
			ReplicatedStorage.WaitForChild("src").WaitForChild("services") as Folder,
			RunService.IsServer()
				? (ServerScriptService.WaitForChild("src").WaitForChild("services") as Folder)
				: (StarterPlayer.WaitForChild("StarterPlayerScripts")
					.WaitForChild("src")
					.WaitForChild("controllers") as Folder),
		]
			.map((dir) => {
				return dir
					.GetDescendants()
					.filter(
						(child): child is ModuleScript =>
							child.IsA("ModuleScript") &&
							paths.some((path) => child.FindFirstAncestor(path) !== undefined),
					);
			})
			.reduce((acc, curr) => [...acc, ...curr]);
	}
}