delete window.$;
let wpRequire = webpackChunkdiscord_app.push([[Symbol()], {}, r => r]);
webpackChunkdiscord_app.pop();

let ApplicationStreamingStore = Object.values(wpRequire.c).find(x => x?.exports?.Z?.__proto__?.getStreamerActiveStreamMetadata)?.exports?.Z;
let RunningGameStore, QuestsStore, ChannelStore, GuildChannelStore, FluxDispatcher, api;

if(!ApplicationStreamingStore) {
	ApplicationStreamingStore = Object.values(wpRequire.c).find(x => x?.exports?.A?.__proto__?.getStreamerActiveStreamMetadata).exports.A;
	RunningGameStore = Object.values(wpRequire.c).find(x => x?.exports?.Ay?.getRunningGames).exports.Ay;
	QuestsStore = Object.values(wpRequire.c).find(x => x?.exports?.A?.__proto__?.getQuest).exports.A;
	ChannelStore = Object.values(wpRequire.c).find(x => x?.exports?.A?.__proto__?.getAllThreadsForParent).exports.A;
	GuildChannelStore = Object.values(wpRequire.c).find(x => x?.exports?.Ay?.getSFWDefaultChannel).exports.Ay;
	FluxDispatcher = Object.values(wpRequire.c).find(x => x?.exports?.h?.__proto__?.flushWaitQueue).exports.h;
	api = Object.values(wpRequire.c).find(x => x?.exports?.Bo?.get).exports.Bo;
} else {
	RunningGameStore = Object.values(wpRequire.c).find(x => x?.exports?.ZP?.getRunningGames).exports.ZP;
	QuestsStore = Object.values(wpRequire.c).find(x => x?.exports?.Z?.__proto__?.getQuest).exports.Z;
	ChannelStore = Object.values(wpRequire.c).find(x => x?.exports?.Z?.__proto__?.getAllThreadsForParent).exports.Z;
	GuildChannelStore = Object.values(wpRequire.c).find(x => x?.exports?.ZP?.getSFWDefaultChannel).exports.ZP;
	FluxDispatcher = Object.values(wpRequire.c).find(x => x?.exports?.Z?.__proto__?.flushWaitQueue).exports.Z;
	api = Object.values(wpRequire.c).find(x => x?.exports?.tn?.get).exports.tn;	
}

const supportedTasks = ["WATCH_VIDEO", "PLAY_ON_DESKTOP", "STREAM_ON_DESKTOP", "PLAY_ACTIVITY", "WATCH_VIDEO_ON_MOBILE"];
let quests = [...QuestsStore.quests.values()].filter(
	x =>
		x.userStatus?.enrolledAt &&
		!x.userStatus?.completedAt &&
		new Date(x.config.expiresAt).getTime() > Date.now() &&
		supportedTasks.find(y =>
			Object.keys((x.config.taskConfig ?? x.config.taskConfigV2).tasks).includes(y)
		)
);

let isApp = typeof DiscordNative !== "undefined";

if(quests.length === 0) {
	console.log("Não tens nenhuma missão por completar!");
} else {
	let doJob = function() {
		const quest = quests.pop();
		if(!quest) return;

		const pid = Math.floor(Math.random() * 30000) + 1000;
		
		const applicationId = quest.config.application.id;
		const applicationName = quest.config.application.name;
		const questName = quest.config.messages.questName;
		const taskConfig = quest.config.taskConfig ?? quest.config.taskConfigV2;
		const taskName = supportedTasks.find(x => taskConfig.tasks[x] != null);
		const secondsNeeded = taskConfig.tasks[taskName].target;
		let secondsDone = quest.userStatus?.progress?.[taskName]?.value ?? 0;

		if(taskName === "WATCH_VIDEO" || taskName === "WATCH_VIDEO_ON_MOBILE") {
			const maxFuture = 10, speed = 7, interval = 1;
			const enrolledAt = new Date(quest.userStatus.enrolledAt).getTime();
			let completed = false;

			let fn = async () => {			
				while(true) {
					const maxAllowed = Math.floor((Date.now() - enrolledAt)/1000) + maxFuture;
					const diff = maxAllowed - secondsDone;
					const timestamp = secondsDone + speed;

					if(diff >= speed) {
						const res = await api.post({
							url: `/quests/${quest.id}/video-progress`,
							body: { timestamp: Math.min(secondsNeeded, timestamp + Math.random()) }
						});
						completed = res.body.completed_at != null;
						secondsDone = Math.min(secondsNeeded, timestamp);
					}
					
					if(timestamp >= secondsNeeded) break;
					await new Promise(resolve => setTimeout(resolve, interval * 1000));
				}

				if(!completed) {
					await api.post({
						url: `/quests/${quest.id}/video-progress`,
						body: { timestamp: secondsNeeded }
					});
				}

				console.log("Missão concluída!");
				doJob();
			};

			fn();
			console.log(`A simular visualização de vídeo para a missão "${questName}".`);
		}

		else if(taskName === "PLAY_ON_DESKTOP") {
			if(!isApp) {
				console.log(
					"Isto já não funciona no browser para missões que não sejam de vídeo. Usa a aplicação de desktop do Discord para completar a missão",
					questName + "!"
				);
			} else {
				api.get({url: `/applications/public?application_ids=${applicationId}`}).then(res => {
					const appData = res.body[0];
					const exeName = appData.executables.find(x => x.os === "win32").name.replace(">","");

					const fakeGame = {
						cmdLine: `C:\\Program Files\\${appData.name}\\${exeName}`,
						exeName,
						exePath: `c:/program files/${appData.name.toLowerCase()}/${exeName}`,
						hidden: false,
						isLauncher: false,
						id: applicationId,
						name: appData.name,
						pid,
						pidPath: [pid],
						processName: appData.name,
						start: Date.now(),
					};

					const realGames = RunningGameStore.getRunningGames();
					const fakeGames = [fakeGame];
					const realGetRunningGames = RunningGameStore.getRunningGames;
					const realGetGameForPID = RunningGameStore.getGameForPID;

					RunningGameStore.getRunningGames = () => fakeGames;
					RunningGameStore.getGameForPID = pid => fakeGames.find(x => x.pid === pid);

					FluxDispatcher.dispatch({
						type: "RUNNING_GAMES_CHANGE",
						removed: realGames,
						added: [fakeGame],
						games: fakeGames
					});

					let fn = data => {
						let progress = quest.config.configVersion === 1
							? data.userStatus.streamProgressSeconds
							: Math.floor(data.userStatus.progress.PLAY_ON_DESKTOP.value);

						console.log(`Progresso da missão: ${progress}/${secondsNeeded}`);

						if(progress >= secondsNeeded) {
							console.log("Missão concluída!");

							RunningGameStore.getRunningGames = realGetRunningGames;
							RunningGameStore.getGameForPID = realGetGameForPID;

							FluxDispatcher.dispatch({
								type: "RUNNING_GAMES_CHANGE",
								removed: [fakeGame],
								added: [],
								games: []
							});

							FluxDispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", fn);
							doJob();
						}
					};

					FluxDispatcher.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", fn);

					console.log(
						`Jogo simulado como ${applicationName}. Aguarda mais ${Math.ceil((secondsNeeded - secondsDone) / 60)} minutos.`
					);
				});
			}
		}

		else if(taskName === "STREAM_ON_DESKTOP") {
			if(!isApp) {
				console.log(
					"Isto já não funciona no browser para missões que não sejam de vídeo. Usa a aplicação de desktop do Discord para completar a missão",
					questName + "!"
				);
			} else {
				let realFunc = ApplicationStreamingStore.getStreamerActiveStreamMetadata;

				ApplicationStreamingStore.getStreamerActiveStreamMetadata = () => ({
					id: applicationId,
					pid,
					sourceName: null
				});

				let fn = data => {
					let progress = quest.config.configVersion === 1
						? data.userStatus.streamProgressSeconds
						: Math.floor(data.userStatus.progress.STREAM_ON_DESKTOP.value);

					console.log(`Progresso da missão: ${progress}/${secondsNeeded}`);

					if(progress >= secondsNeeded) {
						console.log("Missão concluída!");
						ApplicationStreamingStore.getStreamerActiveStreamMetadata = realFunc;
						FluxDispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", fn);
						doJob();
					}
				};

				FluxDispatcher.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", fn);

				console.log(
					`Stream simulada como ${applicationName}. Faz stream de qualquer janela num canal de voz durante mais ${Math.ceil((secondsNeeded - secondsDone) / 60)} minutos.`
				);
				console.log("Lembra-te que é necessário pelo menos mais 1 pessoa no canal de voz!");
			}
		}

		else if(taskName === "PLAY_ACTIVITY") {
			const channelId =
				ChannelStore.getSortedPrivateChannels()[0]?.id ??
				Object.values(GuildChannelStore.getAllGuilds()).find(
					x => x != null && x.VOCAL.length > 0
				).VOCAL[0].channel.id;

			const streamKey = `call:${channelId}:1`;

			let fn = async () => {
				console.log("A completar missão", questName, "-", quest.config.messages.questName);

				while(true) {
					const res = await api.post({
						url: `/quests/${quest.id}/heartbeat`,
						body: { stream_key: streamKey, terminal: false }
					});

					const progress = res.body.progress.PLAY_ACTIVITY.value;
					console.log(`Progresso da missão: ${progress}/${secondsNeeded}`);

					await new Promise(resolve => setTimeout(resolve, 20 * 1000));

					if(progress >= secondsNeeded) {
						await api.post({
							url: `/quests/${quest.id}/heartbeat`,
							body: { stream_key: streamKey, terminal: true }
						});
						break;
					}
				}

				console.log("Missão concluída!");
				doJob();
			};

			fn();
		}
	};

	doJob();
}
