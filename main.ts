import { DateTime } from "luxon";
import {
	App,
	ItemView,
	Plugin,
	PluginSettingTab,
	Setting,
	WorkspaceLeaf,
	Notice,
	debounce,
} from "obsidian";

// Define the constant for the ClockView type
const ClockViewType = "tokei";

// Define the ClockView class that extends ItemView
class ClockView extends ItemView {
	private readonly plugin: ClockPlugin;
	private updateInterval: number | null = null;
	// Container elements for time, date, and timezone
	private timeDateContainer: HTMLElement;
	private timezoneContainer: HTMLElement;
	private dateContainer: HTMLElement;
	private weekQuarterContainer: HTMLElement;

	// New properties for time, date, and timezone elements
	private timeElement: HTMLElement;
	private dateElement: HTMLElement;
	private quarterElement: HTMLElement;
	private weekElement: HTMLElement;
	private timezoneElements: { [key: string]: HTMLElement } = {};

	constructor(leaf: WorkspaceLeaf, plugin: ClockPlugin) {
		super(leaf);
		this.plugin = plugin;

		// Create containers for time, date, and timezone
		this.timeDateContainer = this.containerEl.createDiv();
		this.timezoneContainer = this.containerEl.createDiv();
		this.weekQuarterContainer = this.containerEl.createDiv();
	}

	// Called when the view is opened
	public async onOpen(): Promise<void> {
		this.initClockDisplay(); // Initialize the clock display setup
		this.displayTime(); // Update the display immediately after setup
		this.updateInterval = window.setInterval(
			this.displayTime.bind(this),
			1000, // Update the display every second
		);
	}

	// Called when the view is closed
	public onClose(): Promise<void> {
		if (this.updateInterval !== null) {
			window.clearInterval(this.updateInterval);
			this.updateInterval = null;
		}
		return super.onClose();
	}

	// Return the ClockView type
	public getViewType(): string {
		return ClockViewType;
	}

	// Return the display text for the view
	public getDisplayText(): string {
		return "Tokei";
	}

	// Return the icon for the view
	public getIcon(): string {
		return "clock";
	}

	// Sort the timezone pairs based on the difference from the current offset
	private sortTimeZones(): TimezonePair[] {
		const currentOffset = DateTime.local().offset;

		return this.plugin.settings.timeZonePairs.slice().sort((a, b) => {
			const offsetA = parseFloat(a.offset);
			const offsetB = parseFloat(b.offset);

			const diffA = Math.abs(currentOffset - offsetA);
			const diffB = Math.abs(currentOffset - offsetB);

			return diffB - diffA;
		});
	}

	public initClockDisplay(): void {
		this.containerEl.empty();
		const clockContainer = this.containerEl.createDiv({
			cls: "clock-container",
		});
		this.timeDateContainer = clockContainer.createDiv("timedate-container");

		// Initialize time element
		this.timeElement = this.timeDateContainer.createDiv({
			cls: "time",
			text: "Loading time...",
		});

		this.timezoneContainer = clockContainer.createDiv("timezone-container");

		if (this.plugin.settings.showDate) {
			this.dateContainer =
				this.timeDateContainer.createDiv("date-container");

			// Initialize date element
			this.dateElement = this.dateContainer.createDiv({
				cls: "date",
				text: "Loading date...",
			});

			this.weekQuarterContainer = this.dateContainer.createDiv(
				"week-quarter-container",
			);

			// Initialize quarter and week elements
			this.quarterElement = this.weekQuarterContainer.createDiv({
				cls: "quarter",
				text: "Q",
			});
			this.weekElement = this.weekQuarterContainer.createDiv({
				cls: "week",
				text: "W",
			});
		}

		// Initialize timezone elements
		this.plugin.settings.timeZonePairs.forEach((entry) => {
			const timezonePair =
				this.timezoneContainer.createDiv("timezone-pair");
			timezonePair.createDiv({
				cls: "timezone-name",
				text: entry.name,
			});
			const timeElement = timezonePair.createDiv({
				cls: "timezone-time",
				text: "Loading...",
			});
			this.timezoneElements[entry.name] = timeElement;
		});

		this.displayTime(); // Ensure display is updated immediately after init
	}

	public displayTime(): void {
		const currentTime = DateTime.local().toFormat(
			this.plugin.settings.timeFormat,
		);
		if (this.timeElement.textContent !== currentTime) {
			this.timeElement.textContent = currentTime;
		}

		if (this.plugin.settings.showDate) {
			const currentDate = DateTime.local().toFormat(
				this.plugin.settings.dateFormat,
			);
			if (this.dateElement.textContent !== currentDate) {
				this.dateElement.textContent = currentDate;
			}

			if (this.plugin.settings.showWeekAndQuarter) {
				const currentWeek = this.calculateWeekOfQuarter();
				const currentQuarter = this.calculateQuarter();
				const fiscalYear = this.calculateYear();
				this.quarterElement.textContent = `FY${fiscalYear}Q${currentQuarter}`;
				this.weekElement.textContent = `W${currentWeek}`;
				this.weekQuarterContainer.style.display = ""; // Ensure the container is visible
			} else {
				this.weekQuarterContainer.style.display = "none"; // Hide the container
			}
		}

		if (this.plugin.settings.showTimeZone) {
			if (this.timezoneContainer.style.display === "none") {
				this.timezoneContainer.style.display = ""; // Make sure the container is visible
			}
			this.updateTimezones(); // Handle timezones update separately
		} else {
			this.timezoneContainer.style.display = "none"; // Hide the container if setting is off
		}
	}

	private updateTimezones(): void {
		this.plugin.settings.timeZonePairs.forEach((entry) => {
			const offset = parseFloat(entry.offset);
			const timezoneTime = DateTime.utc()
				.plus({ hours: offset })
				.toFormat(this.plugin.settings.timezoneFormat);

			const timeElement = this.timezoneElements[entry.name];
			if (timeElement && timeElement.textContent !== timezoneTime) {
				timeElement.textContent = timezoneTime;
			}
		});
	}

	private calculateWeekOfQuarter(): number {
		const startOfQuarter = DateTime.local().startOf("quarter");
		const currentDate = DateTime.local();
		const millisecondsPerWeek = 7 * 24 * 60 * 60 * 1000;

		if (this.plugin.settings.weekStart === "sunday") {
			const startOfQuarterSunday = startOfQuarter.startOf("week");
			const daysUntilSunday = 7 - startOfQuarterSunday.weekday;
			const adjustedStartOfQuarterSunday = startOfQuarterSunday.plus({
				days: daysUntilSunday,
			});
			const diffInWeeks = Math.floor(
				currentDate.diff(adjustedStartOfQuarterSunday, "milliseconds")
					.milliseconds / millisecondsPerWeek,
			);
			const currentWeek = diffInWeeks + 1;
			return currentWeek === 0 ? 13 : currentWeek;
		} else {
			// Luxon default start of the week is Monday
			const currentWeek = Math.ceil(
				currentDate.diff(startOfQuarter, "weeks").weeks + 1,
			);
			return currentWeek === 0 ? 13 : currentWeek;
		}
	}

	private calculateQuarter(): number {
		// Adjust for 0 based reference - we are saving the actual month number
		// In the settings so -1 is the adjustment
		const fiscalYearStart = this.plugin.settings.fiscalYearStart - 1;
		const today = new Date();
		const month = today.getMonth();
		const monthIndex = (month - fiscalYearStart + 12) % 12;
		return ~~(monthIndex / 3) + 1;
	}

	private calculateYear(): number {
		// Adjust for 0 based reference - we are saving the actual month number
		// In the settings so -1 is the adjustment
		const fiscalYearStart = this.plugin.settings.fiscalYearStart - 1;
		const today = new Date();
		let year = today.getFullYear();
		const month = today.getMonth();
		const yearOffset =
			Math.floor((month - (fiscalYearStart % 12 || 12)) / 12) + 1;
		year = yearOffset + year;
		// Return only the last two digits of the year
		return year % 100;
	}
}

// Interface for timezone pairs
interface TimezonePair {
	name: string;
	offset: string;
}

// Interface for plugin settings
interface ClockSettings {
	timeFormat: string;
	showDate: boolean;
	dateFormat: string;
	showTimeZone: boolean;
	timeZonePairs: TimezonePair[];
	timezoneFormat: string;
	weekStart: "sunday" | "monday";
	fiscalYearStart: number;
	showWeekAndQuarter: boolean;
}

// Default plugin settings
const DEFAULT_SETTINGS: ClockSettings = {
	timeFormat: "HH:mm",
	showDate: true,
	dateFormat: "DDD",
	showTimeZone: true,
	timeZonePairs: [
		{
			name: "",
			offset: "",
		},
	],
	timezoneFormat: "HH:mm EEE",
	weekStart: "sunday",
	fiscalYearStart: 1,
	showWeekAndQuarter: true,
};

// Define the ClockPlugin class that extends Plugin
export default class ClockPlugin extends Plugin {
	view: ClockView;
	settings: ClockSettings;
	updateInterval: NodeJS.Timeout | null = null;
	settingsChanged: boolean;

	// Load plugin settings, register the ClockView, add the 'Open Clock'
	// command, and set up layout readiness check
	public async onload(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);

		this.registerView(
			ClockViewType,
			(leaf) => (this.view = new ClockView(leaf, this)),
		);

		this.addCommand({
			id: "open",
			name: "open",
			callback: this.onShow.bind(this),
		});

		this.app.workspace.onLayoutReady(async () => {
			await this.initView();
		});

		this.addSettingTab(new ClockSettingTab(this.app, this));
	}

	// Clear the update interval when the plugin is unloaded
	public onunload(): void {
		if (this.updateInterval !== null) {
			window.clearInterval(this.updateInterval);
			this.updateInterval = null;
		}
	}

	// Open the Clock view when the 'Open Clock' command is invoked
	public onShow(): void {
		this.initView();
	}

	// Initialize the Clock view and set up the update interval
	private async initView(): Promise<void> {
		if (this.app.workspace.getLeavesOfType(ClockViewType).length) {
			return;
		}
		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: ClockViewType });
			this.app.workspace.revealLeaf(leaf);
			this.view.displayTime();
			this.updateInterval = setInterval(
				this.view.displayTime.bind(this.view),
				1000,
			);
		}
	}

	// Save plugin settings
	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.settingsChanged = true;
	}

	checkAndSortTimezones() {
		if (this.settingsChanged) {
			this.settings.timeZonePairs = this.sortTimeZones();
			this.settingsChanged = false;
		}
	}

	sortTimeZones(): TimezonePair[] {
		const currentOffset = DateTime.local().offset;
		return this.settings.timeZonePairs.slice().sort((a, b) => {
			const offsetA = parseFloat(a.offset);
			const offsetB = parseFloat(b.offset);
			return (
				Math.abs(currentOffset - offsetA) -
				Math.abs(currentOffset - offsetB)
			);
		});
	}
}

function createHintElement(): HTMLElement {
	const hint = document.createElement("small");
	hint.classList.add("small-hint");
	return hint;
}

// Settings for the app
class ClockSettingTab extends PluginSettingTab {
	private readonly plugin: ClockPlugin;

	constructor(app: App, plugin: ClockPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	public display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const div = containerEl.createEl("div", {
			cls: "recent-files-donation",
		});

		const donateText = document.createElement("div");
		donateText.className = "donate-text";

		const donateDescription = document.createElement("p");
		donateDescription.textContent =
			"If you find this plugin valuable and would like to support its development, please consider using the button below. Your contribution is greatly appreciated!";

		donateText.appendChild(donateDescription);

		const donateLink = document.createElement("a");
		donateLink.href = "https://www.buymeacoffee.com/mstam30561";
		donateLink.target = "_blank";

		function rotateColorRandomly(element: HTMLElement) {
			const rotationDegrees = Math.floor(Math.random() * 8 + 1) * 45; // Randomly select a rotation value in increments of 45 degrees
			element.style.filter = `hue-rotate(${rotationDegrees}deg)`;
		}

		const donateImage = document.createElement("img");
		donateImage.src =
			"https://cdn.buymeacoffee.com/buttons/v2/default-blue.png";
		donateImage.alt = "Buy Me A Coffee";

		rotateColorRandomly(donateImage);
		donateImage.classList.add("donate-img");
		donateLink.appendChild(donateImage);
		donateText.appendChild(donateLink);

		div.appendChild(donateText);

		containerEl.createEl("h1", { text: "Tokei" });

		// Add a link to the Luxon reference
		const h2El = containerEl.createEl("p", {
			text: "Use the Luxon format for all time and date settings: ",
		});
		h2El.createEl("a", {
			text: " Luxon Reference",
			href: "https://moment.github.io/luxon/#/formatting?id=table-of-tokens",
			attr: {
				target: "_blank",
			},
		});

		// Time Format Setting
		const timeFormatInput = new Setting(containerEl)
			.setName("Time format")
			.setDesc("Default Luxon format is HH:mm")
			.addText((text) => {
				const textField = text
					.setPlaceholder("Enter the time format")
					.setValue(this.plugin.settings.timeFormat);

				const hint = document.createElement("small");
				hint.classList.add("small-hint");
				textField.inputEl.after(hint);

				const handleInputDebounced = debounce(() => {
					const value = textField.getValue().trim();
					if (value !== "") {
						this.plugin.settings.timeFormat = value;
						this.plugin.saveSettings();
						this.plugin.view.displayTime();
						hint.textContent = "";
					}
				}, 1250);

				// Immediate function to handle empty input
				const handleInputImmediate = () => {
					const value = textField.getValue().trim();
					if (value === "") {
						hint.textContent = "Enter a valid format";
					} else {
						handleInputDebounced();
					}
				};

				textField.inputEl.addEventListener(
					"input",
					handleInputImmediate,
				);
			})

			.addExtraButton((button) =>
				button
					.setIcon("reset")
					.setTooltip("Reset time format")
					.onClick(async () => {
						this.plugin.settings.timeFormat =
							DEFAULT_SETTINGS.timeFormat;
						await this.plugin.saveSettings();
						this.plugin.view.displayTime();
						const timeFormatInputEl =
							timeFormatInput.settingEl.querySelector("input");
						const hint =
							timeFormatInput.settingEl.querySelector("small");
						if (timeFormatInputEl instanceof HTMLInputElement) {
							timeFormatInputEl.value =
								this.plugin.settings.timeFormat;
						}
						if (hint instanceof HTMLElement) {
							hint.textContent = "";
						}
						new Notice("Time Format Reset");
					}),
			);

		// Style the settings - see CSS
		timeFormatInput.settingEl.classList.add("time-format-settings");

		// Show Date Setting
		const showDateSetting = new Setting(containerEl)

			.setName("Show date")
			.setDesc("Enable to show the date.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.showDate)
					.onChange(async (value) => {
						this.plugin.settings.showDate = value;
						await this.plugin.saveSettings();

						const clockView = this.app.workspace
							.getLeavesOfType("tokei")
							.find((leaf) => leaf.view instanceof ClockView);
						if (clockView) {
							(clockView.view as ClockView).displayTime();
						}

						// Show or hide the Date Format setting based on the toggle value
						dateFormatSetting.settingEl.style.display = value
							? ""
							: "none";

						// Show or hide the Show Week and Quarter setting and its
						// corresponding settings based on the toggle value
						showWeekAndQuarterSetting.settingEl.style.display =
							value ? "" : "none";
						weekStartSetting.settingEl.style.display = value
							? ""
							: "none";
						yearStartSetting.settingEl.style.display = value
							? ""
							: "none";
						weekQuarterContainer.style.display = value
							? ""
							: "none";
					});
			});

		// Style the settings see CSS
		showDateSetting.settingEl.classList.add("show-date-settings");

		// Date Format Setting
		const dateFormatSetting = new Setting(containerEl)
			.setName("Date format")
			.setDesc("Default Luxon format is DDD")
			.addText((text) => {
				const textField = text
					.setPlaceholder("Enter the date format")
					.setValue(this.plugin.settings.dateFormat);

				const hint = document.createElement("small");
				hint.classList.add("small-hint");
				textField.inputEl.after(hint);

				// Debounced function to handle non-empty input
				const handleInputDebounced = debounce(() => {
					const value = textField.getValue().trim();
					if (value !== "") {
						this.plugin.settings.dateFormat = value;
						this.plugin.saveSettings();
						this.plugin.view.displayTime();
						hint.textContent = "";
					}
				}, 1250);

				// Immediate function to handle empty input
				const handleInputImmediate = () => {
					const value = textField.getValue().trim();
					if (value === "") {
						hint.textContent = "Enter a format";
					} else {
						handleInputDebounced();
					}
				};

				textField.inputEl.addEventListener(
					"input",
					handleInputImmediate,
				);
			})
			.addExtraButton((button) =>
				button
					.setIcon("reset")
					.setTooltip("Reset date format")
					.onClick(async () => {
						this.plugin.settings.dateFormat =
							DEFAULT_SETTINGS.dateFormat;
						await this.plugin.saveSettings();
						this.plugin.view.displayTime();
						const dateFormatInputEl =
							dateFormatSetting.settingEl.querySelector("input");
						const hint =
							dateFormatSetting.settingEl.querySelector("small");
						if (dateFormatInputEl instanceof HTMLInputElement) {
							dateFormatInputEl.value =
								this.plugin.settings.dateFormat;
						}
						if (hint instanceof HTMLElement) {
							hint.textContent = "";
						}
						new Notice("Date Format Reset");
					}),
			);

		// Style the settings - see the CSS
		dateFormatSetting.settingEl.classList.add("date-format-settings");

		// Week and Quarter settings
		const showWeekAndQuarterSetting = new Setting(containerEl)
			.setName("Show Fiscal Date")
			.setDesc(
				"Enable to show the Fiscal Year & Quarter and the Week of the Quarter.",
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.showWeekAndQuarter)
					.onChange(async (value) => {
						this.plugin.settings.showWeekAndQuarter = value;
						await this.plugin.saveSettings();
						const clockView = this.app.workspace
							.getLeavesOfType(ClockViewType)
							.find((leaf) => leaf.view instanceof ClockView);
						if (clockView) {
							(clockView.view as ClockView).displayTime();
						}

						// Hide or show the Week Starts On and Year Starts On
						// settings based on the toggle value
						weekStartSetting.settingEl.style.display = value
							? ""
							: "none";
						yearStartSetting.settingEl.style.display = value
							? ""
							: "none";
						weekQuarterContainer.style.display = value
							? ""
							: "none";
					});
			});
		// Style the settings - see CSS
		showWeekAndQuarterSetting.settingEl.classList.add(
			"week-quarter-settings",
		);

		// Week Starts On Setting
		const weekStartSetting = new Setting(containerEl)
			.setName("Week Starts On")
			.setDesc(
				"Select the start day of the week. This affects the week of the quarter calculation.",
			)
			.addDropdown((dropdown) => {
				dropdown
					.addOptions({
						sunday: "Sunday", // Option for starting the week on Sunday
						monday: "Monday", // Option for starting the week on Monday
					})
					.setValue(this.plugin.settings.weekStart) // Set the current value from settings
					.onChange(async (value) => {
						this.plugin.settings.weekStart = value as
							| "sunday"
							| "monday"; // Update the setting based on user selection

						// Asynchronously save the updated settings
						await this.plugin.saveSettings();

						// After saving settings, refresh the clock view to reflect changes
						const clockView = this.app.workspace
							.getLeavesOfType(ClockViewType) // Find all views of the ClockViewType
							.find((leaf) => leaf.view instanceof ClockView); // Ensure the leaf contains a ClockView

						// If a ClockView is found, call displayTime to update the display
						if (clockView) {
							(clockView.view as ClockView).displayTime();
						} else {
							// Optionally log or handle the case where no ClockView is found
							console.error(
								"No active ClockView found to update.",
							);
						}
					});
			});

		weekStartSetting.settingEl.classList.add("week-start-settings");

		// Year Starts On Setting
		const yearStartSetting = new Setting(containerEl)
			.setName("Year Starts On")
			.setDesc(
				"Select the start of your fiscal year. Select January for default.",
			)
			.addDropdown((dropdown) => {
				const monthOptions: Record<string, string> = {
					"1": "January",
					"2": "February",
					"3": "March",
					"4": "April",
					"5": "May",
					"6": "June",
					"7": "July",
					"8": "August",
					"9": "September",
					"10": "October",
					"11": "November",
					"12": "December",
				};

				dropdown
					.addOptions(monthOptions)
					.setValue(this.plugin.settings.fiscalYearStart.toString())
					.onChange(async (value) => {
						this.plugin.settings.fiscalYearStart = parseInt(value);
						await this.plugin.saveSettings();
						const clockView = this.app.workspace
							.getLeavesOfType(ClockViewType)
							.find((leaf) => leaf.view instanceof ClockView);
						if (clockView) {
							(clockView.view as ClockView).displayTime();
						}
					});
			});

		// Style the settings - see CSS
		yearStartSetting.settingEl.classList.add("year-start-settings");

		// Week and Quarter Container
		const weekQuarterContainer = containerEl.createDiv();
		weekQuarterContainer.style.display = this.plugin.settings
			.showWeekAndQuarter
			? ""
			: "none";

		// This ensures the initial display is set correctly based on settings
		if (showWeekAndQuarterSetting) {
			weekStartSetting.settingEl.style.display = this.plugin.settings
				.showWeekAndQuarter
				? ""
				: "none";
			yearStartSetting.settingEl.style.display = this.plugin.settings
				.showWeekAndQuarter
				? ""
				: "none";
		}

		const showTimezonesSetting = new Setting(containerEl)
			.setName("Show timezones")
			.setDesc("Enable to show the timezones.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.showTimeZone)
					.onChange(async (value) => {
						this.plugin.settings.showTimeZone = value;
						await this.plugin.saveSettings();

						// Directly update the display of timezone information in the UI
						if (this.plugin.view) {
							this.plugin.view.displayTime(); // This will handle showing/hiding based on the new setting
						}
					});
			});

		// Style the settings
		showTimezonesSetting.settingEl.classList.add("show-timezones-settings");

		// Timezone Format Setting
		const timezoneFormatSetting = new Setting(containerEl)
			.setName("Timezone Format")
			.setDesc("Default Luxon format is HH:mm EEE")
			.addText((text) => {
				const textField = text
					.setPlaceholder("Enter the timezone format")
					.setValue(this.plugin.settings.timezoneFormat);

				const hint = document.createElement("small");
				hint.classList.add("small-hint");
				textField.inputEl.after(hint);

				// Debounced function to handle non-empty input
				const handleInputDebounced = debounce(() => {
					const value = textField.getValue().trim();
					if (value !== "") {
						this.plugin.settings.timezoneFormat = value;
						this.plugin.saveSettings();
						this.plugin.view.displayTime();
						hint.textContent = "";
					}
				}, 1250);

				// Immediate function to handle empty input
				const handleInputImmediate = () => {
					const value = textField.getValue().trim();
					if (value === "") {
						hint.textContent = "Enter a format";
					} else {
						handleInputDebounced();
					}
				};

				textField.inputEl.addEventListener("input", handleInputImmediate);

			})
			.addExtraButton((button) =>
				button
					.setIcon("reset")
					.setTooltip("Reset timezone format")
					.onClick(async () => {
						this.plugin.settings.timezoneFormat =
							DEFAULT_SETTINGS.timezoneFormat;
						await this.plugin.saveSettings();
						this.plugin.view.displayTime();
						const timezoneFormatInputEl =
							timezoneFormatSetting.settingEl.querySelector(
								"input",
							);
						const hint =
							timezoneFormatSetting.settingEl.querySelector(
								"small",
							);
						if (timezoneFormatInputEl instanceof HTMLInputElement) {
							timezoneFormatInputEl.value =
								this.plugin.settings.timezoneFormat;
						}
						if (hint instanceof HTMLElement) {
							hint.textContent = "";
						}
						new Notice("Timezone Format Reset");
					}),
			);
		// Style Settings - see CSS
		timezoneFormatSetting.settingEl.classList.add(
			"timezone-format-settings",
		);

		// Timezone Pairs Setting
		const timezonePairsSetting = new Setting(containerEl)
			.setName("Timezone settings")
			.setDesc(
				createFragment((fragment) => {
					fragment.append(
						"Enter the timezones you would like to display.",
						fragment.createEl("br"),
						fragment.createEl("br"),
						"Example: enter EST for name and -4 for offset.",
						fragment.createEl("br"),
						fragment.createEl("a", {
							text: "Timzone offset Reference",
							href: "https://www.timeanddate.com/time/map/",
						}),
						fragment.createEl("br"),
						fragment.createEl("br"),
						" A maximum of 5 timezones are allowed.",
						fragment.createEl("br"),
						fragment.createEl("br"),
						"Timezone Name and Offset pairs are not validated.",
					);
				}),
			);
		timezonePairsSetting.settingEl.classList.add("timezone-pairs-settings");
		const timezoneTable = timezonePairsSetting.settingEl.createEl("table");
		const timezoneTableHeader = timezoneTable.createEl("tr");
		timezoneTableHeader.createEl("th", { text: "Name" });
		timezoneTableHeader.createEl("th", { text: "Offset" });
		timezoneTableHeader.createEl("th", { text: "" });

		this.plugin.settings.timeZonePairs.forEach((entry, index) => {
			const row = timezoneTable.createEl("tr");

			const nameCell = row.createEl("td");
			const nameInput = nameCell.createEl("input", {
				type: "text",
				value: entry.name,
				cls: "custom-input-width",
			});

			const hint = createHintElement();

			// Debounce function for name input
			const handleInput = debounce(() => {
				const newName = nameInput.value.trim();
				if (newName !== "") {
					entry.name = newName;
					this.plugin.saveSettings();
					this.plugin.view.displayTime();
					hint.textContent = "";
				} else {
					hint.textContent = "Invalid format";
				}
			}, 1250);

			nameInput.addEventListener("input", handleInput);
			nameInput.addEventListener("focus", handleInput);

			const offsetCell = row.createEl("td");
			const offsetInput = offsetCell.createEl("input", {
				type: "text",
				value: entry.offset,
				cls: "custom-input-width",
			});

			// Debounce function for offset input
			const handleOffsetChange = debounce(() => {
				const newOffset = offsetInput.value.trim();
				if (this.isValidTimeZoneOffset(newOffset)) {
					entry.offset = newOffset;
					this.plugin.saveSettings();
					this.plugin.view.displayTime();
					hint.textContent = "";
				} else {
					hint.textContent = "Invalid format";
				}
			}, 1250);

			offsetInput.addEventListener("input", handleOffsetChange);
			offsetInput.addEventListener("focus", handleOffsetChange);

			offsetCell.appendChild(hint);

			const buttonsCell = row.createEl("td");
			if (index !== 0) {
				const deleteButton = buttonsCell.createEl("button", {
					text: "-",
				});
				deleteButton.classList.add("deleteButtonClass");
				deleteButton.addEventListener("click", async () => {
					this.plugin.settings.timeZonePairs.splice(index, 1);
					await this.plugin.saveSettings();
					this.display();
				});
			}

			if (index === this.plugin.settings.timeZonePairs.length - 1) {
				if (this.plugin.settings.timeZonePairs.length < 5) {
					const addButton = buttonsCell.createEl("button", {
						text: "+",
					});
					addButton.classList.add("addButtonClass");
					// Add event listener for the "Add" button
					addButton.addEventListener("click", async () => {
						if (this.plugin.settings.timeZonePairs.length < 5) {
							this.plugin.settings.timeZonePairs.push({
								name: "",
								offset: "",
							});
							await this.plugin.saveSettings();
							this.display();

							// Get the index of the newly added cell
							const newIndex =
								this.plugin.settings.timeZonePairs.length - 1;

							// Get the corresponding input elements
							const newNameInput = timezoneTable.querySelectorAll(
								'input[name="timezone-name"]',
							)[newIndex] as HTMLInputElement;
							const newOffsetInput =
								timezoneTable.querySelectorAll(
									'input[name="timezone-offset"]',
								)[newIndex] as HTMLInputElement;

							// Validate and display hint for the newly added cell
							validateAndDisplayHint(
								newNameInput,
								newOffsetInput,
							);
						}
					});
				}
			} else if (
				index === this.plugin.settings.timeZonePairs.length - 2 &&
				this.plugin.settings.timeZonePairs.length === 5
			) {
				new Notice("Maximum timezone entries added.");
			}

			if (
				index !== 0 &&
				index === this.plugin.settings.timeZonePairs.length - 1
			) {
				buttonsCell.classList.add("twoButtonsClass");
			}
		});

		const validateAndDisplayHint = (
			nameInput: HTMLInputElement,
			offsetInput: HTMLInputElement,
		) => {
			// Validate name input
			const newName = nameInput.value.trim();
			if (newName === "") {
				nameInput.classList.add("invalid-input");
				nameInput.title = "Invalid format";
			} else {
				nameInput.classList.remove("invalid-input");
				nameInput.removeAttribute("title");
			}

			// Validate offset input
			const newOffset = offsetInput.value.trim();
			if (!this.isValidTimeZoneOffset(newOffset)) {
				offsetInput.classList.add("invalid-input");
				offsetInput.title = "Invalid format";
			} else {
				offsetInput.classList.remove("invalid-input");
				offsetInput.removeAttribute("title");
			}
		};

		// Show or hide settings based on the initial values of toggle switches
		dateFormatSetting.settingEl.style.display = this.plugin.settings
			.showDate
			? ""
			: "none";
		timeFormatInput.settingEl.style.display = this.plugin.settings.showDate
			? ""
			: "none";
		timezoneFormatSetting.settingEl.style.display = this.plugin.settings
			.showTimeZone
			? ""
			: "none";
		timezonePairsSetting.settingEl.style.display = this.plugin.settings
			.showTimeZone
			? ""
			: "none";
	}

	private isValidTimeZoneOffset(offset: string): boolean {
		const offsetRegex =
			/^([-+]?((1[0-2]|0?[1-9])(\.\d+)?|0?\.5))|(\+1[0-4](\.\d+)?|0)$/;
		return offsetRegex.test(offset);
	}
}
