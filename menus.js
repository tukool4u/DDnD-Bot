'use strict';

const { EmbedBuilder, ActionRowBuilder, SelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const crypto = require('crypto');
const fs = require('fs');

//const firebase = require('./firebase.js');

const jGameData = JSON.parse(fs.readFileSync('./data.json'));

async function cancelFlightPlan(interaction) {
    const embed = new MessageEmbed();
    const error = await firebase.cancelFlightPlan(interaction.guildId, interaction.customId);
	const author = interaction.member.nickname ? interaction.member.nickname : interaction.user.username;
	
    if (error) {
        embed.setColor('#ffa0a0');
        embed.setTitle('Error');
        embed.setDescription(`There was a problem cancelling this flight plan.\n\n${error}`);
    } else {
        embed.setColor('#aa0000');
        embed.setTitle(`Flight Plan Canceled`);
        embed.setDescription(`**${interaction.customId}** has been cancelled.`)
		embed.setAuthor({ name: author, iconURL: interaction.member.user.displayAvatarURL() })
		embed.setTimestamp(new Date())
		embed.setThumbnail(interaction.guild.iconURL());
    }

    return await embed;
}

async function cancelATO(interaction) {
    const embed = new MessageEmbed();
    const error = await firebase.cancelATO(interaction.guildId, interaction.customId);
	const author = interaction.member.nickname ? interaction.member.nickname : interaction.user.username;
	
    if (error) {
        embed.setColor('#ffa0a0');
        embed.setTitle('Error');
        embed.setDescription(`There was a problem cancelling this ATO.\n\n${error}`);
    } else {
        embed.setColor('#aa0000');
        embed.setTitle(`ATO Canceled`);
        embed.setDescription(`**${interaction.customId}** has been cancelled.`)
		embed.setAuthor({ name: author, iconURL: interaction.member.user.displayAvatarURL() })
		embed.setTimestamp(new Date())
		embed.setThumbnail(interaction.guild.iconURL());
    }

    return await embed;
}

async function getActiveFlightPlans(guild) {
    const flightplans = await firebase.getActiveFlightPlans(guild.id);
    const embed = new MessageEmbed();
		
    try {
        embed.setColor('#0000ff');
        embed.setTitle('Active Ranges');
        embed.setDescription('\u200b');
		embed.setThumbnail(guild.iconURL());

        Object.keys(flightplans).forEach(k => {
            embed.addField(flightplans[k].range, `${flightplans[k].block}`, true);
            embed.addField('Flight', flightplans[k].flight, true);
            embed.addField('Expires', `<t:${Math.floor(flightplans[k].expiry / 1000)}:t>`, true);
        });
    } catch {
        embed.setColor('#a1a1a1');
        embed.setTitle('No Active Ranges');
        embed.setDescription('\u200b');
		embed.setThumbnail(guild.iconURL());
    }

    return await embed;
}

async function getRandomScenario() {
	const scenarios = jGameData.scenarios;

	return await scenarios[Math.floor(Math.random() * scenarios.length)];
}

async function getAvailableComplexes(guildId) {
	const flightplans = await firebase.getActiveFlightPlans(guildId);
	const complexes = jRangeInfo.complexes;
	const active = flightplans ? Object.keys(flightplans).map(fp_key => flightplans[fp_key].range) : null;
	const filtered = active ? jRangeInfo.ranges.filter(r => !active.includes(r.id)).map(c => c.complex) : complexes.map(c => c.id);
	const fields = complexes.filter(c => filtered.includes(c.id)).map(c => c.field);
	
	return await fields;
}

async function getAvailableRanges(guildId, complex) {
	const flightplans = await firebase.getActiveFlightPlans(guildId);
	const ranges = jRangeInfo.ranges.filter(r => r.complex === complex);
	const active = flightplans ? Object.keys(flightplans).map(fp_key => ({ range: flightplans[fp_key].range, block: flightplans[fp_key].block })) : null;
	const filtered = active ? ranges.filter(r => !active.includes(active.find(a => a.range === r.id))) : ranges;
	const fields = filtered.map(r => r.field);
	
	return await fields;
}

async function getAvailableBlocks(guildId, range) {
	const flightplans = await firebase.getActiveFlightPlans(guildId);
	const blocks = jRangeInfo.blocks.filter(b => jRangeInfo.ranges.find(r => r.id === range).blocks.includes(b.id));
	const complex = jRangeInfo.ranges.find(r => r.id === range).complex;
	const active = flightplans ? Object.keys(flightplans).filter(fp_key => flightplans[fp_key].complex === complex).map(fp_key => flightplans[fp_key].block) : null;
	const filtered = active ? blocks.filter(b => !active.includes(b.field.value)) : blocks;
	const fields = filtered.map(b => b.field);
	
	return await fields;
}

async function getAvailableFlights(guildId, callsign) {
	const flightplans = await firebase.getActiveFlightPlans(guildId);
	const active = flightplans ? Object.keys(flightplans).filter(k => flightplans[k].flight.includes(callsign)).map(k => flightplans[k].flight) : null;
	const filtered = active ? jRangeInfo.elements.filter(e => !active.includes(`${callsign} ${e}`)) : jRangeInfo.elements;
	const fields = filtered.map(e => ({ label: `${callsign} ${e}`, value: `${callsign} ${e}` }));
	
	return await fields;
}

// exports
module.exports = {
    clearRange: async function (guildId, id) {
        return await clearRange(guildId, id);
    },
	
	cancelFlightPlan: async function (interaction) {
		return await cancelFlightPlan(interaction);
	},
	
	cancelATO: async function (interaction) {
		return await cancelATO(interaction);
	},
	
	getActiveFlightPlans: async function (guildId) {
		return await getActiveFlightPlans(guildId);
	},
	
	saveFlightPlan: async function (guildId, fp) {
		firebase.pushFP(guildId, fp);
	},
	
	saveATO: async function (guildId, ato) {
		firebase.pushATO(guildId, ato);
	},
	
	getFlightPlanCount: async function (guildId) {
		return await firebase.getFlightPlanCount(guildId);
	},
	
	getBlock: function (id) {
		return jRangeInfo.blocks.find(b => b.id === id).field.label
	},
	
	getCallsign: function (roles) {
		return jRangeInfo.callsigns.find(c => c.role === roles.find(r => r === c.role));
	},
	
	getSCLs: function (airframe) {
		return jSCL.airframes.find(a => a.id === airframe);
	},
	
	getPNCs: function () {
		return jPNC.pncs;
	},
	
	getThreats: function (type) {
		return jThreats.threats[type];
	},
	
	// begin embeds
	welcomeEmbed: function () {
		return new EmbedBuilder()
			.setColor('#0099ff')
			.setTitle('New DDnD Adventure')
			.setDescription('Welcome daring adventurer!. You are about to embark on a magnificent journey into the nether-realms of dragons, magic, treasure, and calamity. Eh... not really. Just a bar fight.\n\nAre you ready to begin?')
	},
		
	getScenarioEmbed: async function () {
		const embed = new EmbedBuilder();
		const scenario = await getRandomScenario();
		
		embed.setTitle(`Scenario - ${scenario.title}`);
		embed.setDescription(scenario.description);
		
		return embed;
	},
	
	getAtoEmbed: async function (interaction, roles, settings) {
		const d = new Date();
		const utcDate = (date, padding) => ('0'.repeat(padding) + date.getUTCDate()).slice(-padding);
		const utcMonth = (date, padding) => padding ? ('0'.repeat(padding) + (date.getUTCMonth() + 1)).slice(-padding) : date.toLocaleString('en-US', { month: 'short' }).toUpperCase();
		const utcHours = (date, padding) => ('0'.repeat(padding) + date.getUTCHours()).slice(-padding);
		const utcMinutes = (date, padding) => ('0'.repeat(padding) + date.getUTCMinutes()).slice(-padding);
		const seq = ('0000' + (await firebase.getAtoCount(interaction.guildId) + 1)).slice(-4);
		const serial = `ATO${utcDate(d, 2)}${utcMonth(d, 2)}${d.getUTCFullYear()}${seq}`;
		const start_date = `${utcDate(d, 2)}${utcHours(d, 2)}${utcMinutes(d, 2)}Z${utcMonth(d)}${d.getUTCFullYear()}`;
		const end_date = new Date(d.setDate(d.getDate() + interaction.options.getInteger('timeframe')));
		const f_end_date = `${utcDate(end_date, 2)}${utcHours(end_date, 2)}${utcMinutes(end_date, 2)}Z${utcMonth(end_date)}${end_date.getUTCFullYear()}`;
		const callsign = jRangeInfo.callsigns.find(c => c.role === roles.find(r => r === c.role));
		const scls = settings.scls.length > 1 ? settings.scls.map((s, i) => `${i+1}:${s}`).join('/') : settings.scls[0];
		const task = interaction.options.getString('task');
		const elevation = await mapbox.getElevation(settings.target.coords);
		const intent = interaction.options.getString('intent');
		const gen_text = interaction.options.getString('gen-text')
		const desc = [];
		
		// build embed description
		desc.push(`${interaction.options.getString('type')}/379thvAEW`);
		desc.push(`MSGID/ATO/379CMD/${serial}`);
		desc.push(`AKNLDG/YES//`);
		desc.push(`TIMEFRAM/FROM:${start_date}/TO:${f_end_date}`);
		desc.push(`TASKUNIT/${callsign.unit}/${interaction.options.getString('takeoff')}//`);
		desc.push(`AMSNDAT/${seq}/${task}`);
		desc.push(`MSNACFT/${interaction.options.getInteger('element-size')}/ACTYP:${callsign.airframe}/${settings.flight}/${scls}`);
		desc.push(`AMSNLOC/${interaction.options.getString('target-area').toUpperCase()}/${interaction.options.getString('altitude')}`);
		
		if (!['CAP', 'ESCORT', 'AIRMOVE'].includes(task)) {
			desc.push(`GTGTLOC/${settings.target.name}/${settings.target.category}`);
			desc.push(`${settings.target.desc}/DMPIS:${settings.target.coords.lat}${settings.target.coords.lon}/${elevation}FT/${intent}`);
		}
		
		// add gen text
		desc.push(`GENTEXT/${gen_text}`);

		return new MessageEmbed()
			.setColor('0xff0044')
			.setTitle(serial)
			.setAuthor({ name: interaction.author, iconURL: interaction.user.displayAvatarURL() })
			.setTimestamp(new Date())
			.setThumbnail(interaction.guild.iconURL())
		
			// build ATO
			.setDescription(
				'```' + '\n' +
				desc.join('\n') +
				 '\n' + '```'
			);
	},
	
	// begin autocomplete options
	getRangeOptions: function () {
		return jRangeInfo.ranges.map(r => ({ name: r.id, value: r.id }));
	},
	
	// begin menus
	getZones: async function () {
		const zones = await getAvailableZones();
		
		return await new MessageActionRow().addComponents(
			new MessageSelectMenu()
				.setCustomId('zones')
				.setPlaceholder('Zone')
				.addOptions(zones)
		);
	},
	
	getComplexes: async function (guildId) {
		const complexes = await getAvailableComplexes(guildId);
		
		return await new MessageActionRow().addComponents(
			new MessageSelectMenu()
				.setCustomId('complex') 
				.setPlaceholder('Range Complex')
				.addOptions(complexes)
		);
	},

	getJtacRange: function () {
		return new MessageActionRow().addComponents(
			new MessageSelectMenu()
				.setCustomId('jtac-range')
				.setPlaceholder('Range')
				.addOptions(jtacRangeOptions)
		)
	},
	
	getRanges: async function (guildId, complex) {
		const ranges = await getAvailableRanges(guildId, complex);
		
		return await new MessageActionRow().addComponents(
			new MessageSelectMenu()
				.setCustomId('range') 
				.setPlaceholder('Range')
				.addOptions(ranges)
		);
	},

	getBlocks: async function (guildId, range) {
		const blocks = await getAvailableBlocks(guildId, range);
		
		return await new MessageActionRow().addComponents(
			new MessageSelectMenu()
				.setCustomId('block') 
				.setPlaceholder('Altitude Block')
				.addOptions(blocks)
		);
	},

	getFlights: async function (guildId, roles) {
		const callsign = jRangeInfo.callsigns.find(c => c.role === roles.find(r => r === c.role)).callsign;
		const flights = guildId ? await getAvailableFlights(guildId, callsign) : jRangeInfo.elements.map(e => ({ label: `${callsign} ${e}`, value: `${callsign} ${e}` }));

		return await new MessageActionRow().addComponents(
			new MessageSelectMenu()
				.setCustomId('flight') 
				.setPlaceholder('Flight')
				.addOptions(flights)
		);
	},
	
    getRangeInfo: function (id, altitude, iconURL) { 
        const embed = new MessageEmbed();
        const range = jRangeInfo.ranges.find(r => r.id === id);
		const restrictions = range ? range.restrictions.map(restriction => `\`- ${restriction}\`\n`) : null;
		const blocks = range ? range.blocks.map(b => jRangeInfo.blocks.find(x => x.id === b).field.label) : null;

        try {
            embed.setColor('#aabbcc')
            embed.setTitle(range.name);
			
			if (altitude)
				embed.setDescription(`**Restrictions**\n${restrictions.join('')}\n**Altitude Blocks**\n${blocks.join(', ')}`);
			else
				embed.setDescription(`**Restrictions**\n${restrictions.join('')}`);
			
			embed.setThumbnail(iconURL);
            embed.addField('Range Complex', range.complex, true);
            embed.addField('Frequency', `CH${range.frequency}`, true);
            embed.addField('JTAC', range.jtac.toString(), true);
            embed.addField('Active', range.active.toString(), true);
            embed.addField('Entry', range.entries.map(e => `${e.name}\n\`${e.coords.lat}\n${e.coords.lon}\`\n\`${e.coords.utm}\`\n${e.desc}`).join('\n'), true);
            embed.addField('Exit', range.exits.map(e => `${e.name}\n\`${e.coords.lat}\n${e.coords.lon}\`\n\`${e.coords.utm}\`\n${e.desc}`).join('\n'), true);
        } catch (e) {
			console.error(e);
			
            embed.setColor('#ff0000');
            embed.setTitle('Range Info Error');
            embed.setDescription(`There is a problem with this range ('${id}').\n\nPlease try a different range.`);
			embed.setThumbnail(iconURL);
        }
			
		return embed;
    },
	
	yesNoButtons: function() {
		return new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId(`ACK`)
				.setLabel('yes')
				.setEmoji('854188355725295637')
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(false),
	
			new ButtonBuilder()
				.setCustomId(`NACK`)
				.setLabel('no')
				.setStyle(ButtonStyle.Danger)
				.setDisabled(false)
			);
	},

	getDurations: function() {
		return new MessageActionRow().addComponents(
			new MessageSelectMenu()
				.setCustomId('duration')
				.setPlaceholder('Estimated Duration')
				.addOptions(jRangeInfo.durations)
		);
	},

	getPilots: async function(interaction, roles) {
		const role = jRangeInfo.callsigns.find(c => c.role === roles.find(r => r === c.role)).role;
		const members = await interaction.guild.members.fetch();
		const pilots = await members.filter(m => m.roles.cache.find(r => r.name === role)).map(m => m.nickname ? ({ label: m.nickname, value: m.nickname }) : ({ label: m.user.username, value: m.user.username }));

		return await new MessageActionRow().addComponents(
			new MessageSelectMenu()
				.setCustomId('pilots')
				.setPlaceholder('Assign Pilots')
				.setMinValues(interaction.options.getInteger('element-size'))
				.setMaxValues(interaction.options.getInteger('element-size'))
				.addOptions(pilots)
		);
	},

	sclMenu: function (interaction, roles, target, page) {
		const callsign = jRangeInfo.callsigns.find(c => c.role === roles.find(r => r === c.role));
		const scls = jSCL.airframes.find(a => a.id === callsign.airframe).scls.filter(s => target === 'AA' ? s['type'] === 'AA' : s['type'] === 'AG');
		const sliced = scls.slice(page * 24, ++page * 24).map(s => ({ label: s.scl, value: s.scl }));
	
		console.log(sliced);
		
		// select menus can only hold 25 items; load 24 plus prompt to load next page or startover
		if (page * 24 < scls.length) {
			sliced.push({ label: 'Show more SCLs', description: '', value: page.toString() });
		} else if ((page * 24) >= scls.length) {
			sliced.push({ label: 'Back to top', description: '', value: "0" });
		}
		
		return new MessageActionRow().addComponents(
			new MessageSelectMenu()
				.setCustomId('scl-list')
				.setPlaceholder('Select SCL')
				.addOptions(sliced)
		);
	},

	flightSize: function () {
		return new MessageActionRow().addComponents(
			new MessageSelectMenu()
				.setCustomId('flight-size')
				.setPlaceholder('Number of Aircraft')
				.addOptions([
					{ label: '1', description: '', value: '1', },
					{ label: '2', description: '', value: '2', },
					{ label: '3', description: '', value: '3', },
					{ label: '4', description: '', value: '4', },
				])
		);
	},

	routings: function () {
		return new MessageActionRow().addComponents(
			new MessageSelectMenu()
				.setCustomId('routing')
				.setPlaceholder('Routing')
				.addOptions([
					{ label: 'Auto', description: 'Let Opso Bot plan your route auto-magically!', value: '1', },
					{ label: 'Custom', description: 'Be boring and use Combined Ops...', value: '2', }
				])
		);
	},
	
	getDepartures: function(range) {
		const departures = jRangeInfo.departures.filter(d => d.routings.find(r => r.range === range)).map(d => d.field);
		
		return new MessageActionRow().addComponents(
			new MessageSelectMenu()
				.setCustomId('departure')
				.setPlaceholder('Departure')
				.addOptions(departures)
		);
	},
	
	getApproaches: function(range) {
		const approaches = jRangeInfo.approaches.filter(a => a.routings.find(r => r.range === range)).map(a => a.field);
		
		return new MessageActionRow().addComponents(
			new MessageSelectMenu()
				.setCustomId('approach')
				.setPlaceholder('Approach')
				.addOptions(approaches)
		);
	},

	// begin modals
	getGroundTargetInfo: function () {
		return new Modal()
			.setCustomId('target-info')
			.setTitle('Target Info');
	
	
			// .addComponents([
				// new MessageActionRow().addComponents([
					// new TextInputComponent()
						// .setCustomId('target-name')
						// .setPlaceholder('Target Name')
						// .setRequired(true),
					// new TextInputComponent()
						// .setCustomId('target-category')
						// .setPlaceholder('Target Category')
						// .setRequired(true),
					// new TextInputComponent()
						// .setCustomId('target-desc')
						// .setPlaceholder('Target Description')
						// .setRequired(true),
					// new TextInputComponent()
						// .setCustomId('target-coords')
						// .setPlaceholder('Target Coordinates')
						// .setRequired(true)
				// ])
			// ]);
	},
	
	// begin utilities
	getRoute: async function(serial, flight, rng, dep, app) {
		const route = {};
		
		route.routing = [];
		route.embed = new MessageEmbed();
		route.range_entry = jRangeInfo.ranges.find(r => r.id === rng).entries[0].coords;
		route.range_exit = jRangeInfo.ranges.find(r => r.id === rng).exits[0].coords;
		route.range_fix = jRangeInfo.ranges.find(r => r.id === rng).navfix;
		route.departure = jRangeInfo.departures.find(d => d.field.value === dep);
		route.approach = jRangeInfo.approaches.find(a => a.field.value === app);
		route.outbound = route.departure.routings.find(r => r.range === rng).route.map(r => jRangeInfo.transits.find(t => t.id === r).coords);
		route.inbound = route.approach.routings.find(r => r.range === rng).route.map(r => jRangeInfo.transits.find(t => t.id === r).coords);
		
		// add departure transition point
		route.routing.push(route.departure.transition);
		
		// add outbound (to range) routing points
		route.outbound.forEach(r => route.routing.push(r));
		
		// add range entry, fix, and exit points
		route.routing.push(route.range_entry, route.range_fix, route.range_exit);
		
		// add inbound (from range) routing points
		route.inbound.forEach(r => route.routing.push(r));
		
		// add approach transition point
		route.routing.push(route.approach.transition);
		
		// build embed
		route.embed.setColor("#aaaaaa");
		route.embed.setTitle(`Routing Details - ${serial}`);
		route.embed.setDescription('```' + '\n' +
			route.departure.transition.lat + ' ' + route.departure.transition.lon + '\n' +
			route.outbound.map(c => c.lat + ' ' + c.lon).join('\n') + '\n' +
			route.range_entry.lat + ' ' + route.range_entry.lon + '\n' +
			route.range_fix.lat + ' ' + route.range_fix.lon + '\n' +
			route.range_exit.lat + ' ' + route.range_exit.lon + '\n' +
			route.inbound.map(c => c.lat + ' ' + c.lon).join('\n') + '\n' +
			route.approach.transition.lat + ' ' + route.approach.transition.lon + '\n' +
			'```'
		);
		
		// creating routing and get image data
		await mapbox.plotRoute(serial, route);
		
		// return image and embed
		return route;
	},
	
	getElevation: async function (lat, lon) {
		return await mapbox.getElevation({ lat: lat, lon: lon });
	}
}