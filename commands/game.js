'use strict';

const { MessageEmbed, MessageActionRow, MessageButton, Modal } = require('discord.js');

const fs = require('fs');

const menus = require('../menus.js');
const jGameData = JSON.parse(fs.readFileSync('./data.json'));

function rollDice(number, value, modifier = 0) {
    const results = [];

    for (let r = 0; r < number; r++) {
        results.push(Math.floor(Math.random() * value));
    }

    return results.reduce((a, b) => a + b, 0) + modifier;
}

function getRandomRace() {
	return jGameData.races[Math.floor(Math.random() * jGameData.races.length)];
}

function getRandomClass() {
	return jGameData.classes[Math.floor(Math.random() * jGameData.classes.length)];
}

function getRandomScenario() {
	return jGameData.scenarios[Math.floor(Math.random() * jGameData.scenarios.length)];
}

function getAbilityScores() {
    const scores = [];

    // assign base ability scores, 8-16 allowing for max +2 racial bonus
    for (let i = 0; i < 6; i++) {
        scores[i] = Math.floor(Math.random() * 6) + 8; 
    }

    return scores;
}

const player = () => {
    return { race: getRandomRace(), class: getRandomClass(), abilities: getAbilityScores() }
}

const opponent = {
    race: getRandomRace(),
    class: getRandomClass(),
    abilities: getAbilityScores()
}

module.exports = {
    player,
    opponent,

	async execute(interaction) {
		const roles = interaction.member.roles.cache.map(r => r.name);
		
		const game = {};

		const filter = (i) => (i.user.id === interaction.user.id && !interaction.user.bot);

		const collector = interaction.channel.createMessageComponentCollector({ filter, componentType: "SELECT_MENU", idle: 30000, dispose: true });

		// start new game
		await interaction.reply({ ephemeral: false, embeds: [ menus.welcomeEmbed() ], components: [ await menus.yesNoButtons() ] });

		collector.on('collect', async i => {
			const menu = i.customId;
			const selection = i.values[0];
			
			// set jtac and reset collector, if needed
			if (menu === 'actions') {
                if (selection === 'ATTACK') {
                    await interaction.update({ ephemeral: false, embeds: [ menus.getAttackEmbed(rollDice) ], components: [] });
                }
			}

			// start specific menu flow
			if (selection === 'GF') {
				await i.update({ embeds: [menus.generalEmbed()], components: [await menus.getZones()] });
			} else if (selection === 'AA') {
				await i.update({ embeds: [menus.airToAirEmbed()], components: [menus.getDurations()] });
			} else if (selection === 'AG') {
				await i.update({ embeds: [menus.rangeComplexEmbed()], components: [await menus.getComplexes(interaction.guildId)] });
			} else if (selection === 'CAS') {
				await i.update({ embeds: [menus.casEmbed()], components: [menus.getJtacRange()] });
			} else if (selection === 'JTAC') {
				await i.update({ embeds: [menus.jtacEmbed()], components: [menus.getJtacRange()] });
			}
			
			// air-to-ground range selection
			if (menu === 'complex') {	
				await i.update({ embeds: [menus.rangeEmbed()], components: [await menus.getRanges(interaction.guildId, selection)] });
			} else if (menu === 'range') {
				await i.update({ embeds: [menus.rangeDetailsEmbed(selection)], components: [await menus.getBlocks(interaction.guildId, selection)] });
			}
			
			// common menus
			if (menu === 'zones' || menu === 'jtac-range' || menu.includes('block')) {
				await i.update({ embeds: [menus.durationEmbed()], components: [menus.getDurations()] });
			} else if (menu === 'duration' && !settings.isJTAC) {
				await i.update({ embeds: [menus.flightSizeEmbed()], components: [menus.flightSize()] });
			} else if (menu === 'flight-size' || (menu === 'duration' && (settings.isJTAC || settings.isCAS))) {
				await i.update({ embeds: [menus.flightEmbed()], components: [await menus.getFlights(interaction.guildId, roles)] });
			} else if (menu === 'flight' && settings.allowAutoRoute) {
				await i.update({ embeds: [menus.routingEmbed()], components: [menus.routings()] });
			} else if (menu === 'routing' && settings.isAutoRoute) {
				await i.update({ embeds: [menus.departureEmbed()], components: [await menus.getDepartures(settings.range)] });
			} else if (menu === 'departure') {
				await i.update({ embeds: [menus.approachEmbed()], components: [await menus.getApproaches(settings.range)] });
			} else if (menu === 'approach') {
				await i.update({ embeds: [], components: [], content: 'standby for routing' });

				// signal successful completion
				collector.stop('complete');
			} else if ((menu === 'routing' && !settings.isAutoRoute) || (menu === 'flight' && !settings.allowAutoRoute)) {
				const uploadEmbed = menus.getUploadEmbed(settings.duration, interaction.guild.iconURL()); 

				// send confirmation embed and remove menus
				await i.update({ embeds: [uploadEmbed], components: [] });
				
				// signal successful completion
				collector.stop('complete');
			} 
		});

		collector.on('end', async (collected, reason) => {
			if (reason === 'complete') {				
				const fields = {};
				const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
				const count = await menus.getFlightPlanCount(interaction.guildId);
				const serial = `TR${date}${count}`;
				const embed = new MessageEmbed()
					.setColor('0xff4400')
					.setTitle(`Flight Plan - ${serial}`)
					.setDescription('\u200b')
					.setAuthor({name: interaction.author, iconURL: collected.first().user.displayAvatarURL() })
					.setTimestamp(new Date())
					.setThumbnail(interaction.guild.iconURL());
					
				// JTAC does not need flight route image
				if (!settings.isJTAC) {
					embed.setImage(`https://via.placeholder.com/400x300.png/808080/000000?text=Please+Upload+Your+Flight+Plan`);
				}

				// get id and value of each menu collected for writeback and display
				collected.forEach((i) => {
					fields[i.customId] = i.values[0];
				});
				
				// flight plans are filtered on the 'range' field; 'range' is not populated for CAS/JTAC
				if (fields['jtac-range'])
					fields['range'] = fields['jtac-range'];
				else if (fields['zones'])
					fields['range'] = fields['zones'];
				
				// get AA range
				if (fields['taskings'] === "AA") {
					fields['range'] = "COYOTE";
				}
				
				// add serial number and user to field list
				fields.serial = serial;
				fields.user = interaction.author;
				
				// set embed field properties
				Object.keys(fields).forEach((f) => {
					if (f === 'taskings') {
						embed.addField("Tasking", fields[f], true);
					} else if (f === 'zones') {
						embed.addField("Zone", fields[f], true);
					} else if (f === 'complex') {
						embed.addField('Range Complex', fields[f], true);
					} else if (f === 'flight') {
						embed.addField("Flight", fields[f], true);
					} else if (f === 'flight-size') {
						embed.addField("Element Size", fields[f], true);
					} else if (f === 'duration') {
						embed.addField('Duration', `${fields[f]} hrs`, true);
					} else if (f === 'range') {
						embed.addField('Range', fields[f], true);
					} else if (f.includes('block')) {
						embed.addField('Alt Block', menus.getBlock(fields[f]), true);
					} else if (f === 'range') {
						embed.addField('Range', fields[f], true);
					} else if (f === 'departure') {
						embed.addField('Departure', fields[f], true);
					} else if (f === 'approach') {
						embed.addField('Approach', fields[f], true);
					}
				});
				
				// pad row with empty fields
				//for (let i = 0; i < ((Math.ceil((embed.fields.length) / 3) * 3) - embed.fields.length); i++)
					embed.addField('\u200b', '\u200b', false);
				
				// add takeoff/land times after padding so they are on new row
				embed.addField('Takeoff NLT', `<t:${Math.floor(new Date(new Date().getTime() + 20 * 60000).getTime() / 1000)}:t>`, true);
				embed.addField('Land NLT', `<t:${Math.floor(new Date(new Date().getTime() + fields['duration'] * 3600000).getTime() / 1000)}:t>`, true);
				embed.addField('\u200b', '\u200b', true);
				
				const buttonRow1 = new MessageActionRow().addComponents(
					new MessageButton()
						.setCustomId(`${serial}`)
						.setLabel('cancel')
						.setStyle('DANGER')
						.setDisabled(false)
				);
				
				// build route if necessary
				if (fields.routing === "1") {
					try {
						// get dtc object
						const dtc = require('./dtc.js');
						
						// get flight plan image and route embed
						const route = await menus.getRoute(fields.serial, fields.flight, fields.range, fields.departure, fields.approach);
						
						// save image to storage channel
						const msg = await interaction.guild.channels.cache.find(channel => channel.name === 'plan-pictures').send({ files: [ `./fp_images/${fields.serial}.png` ] });
						
						// update embed image link
						embed.setImage(msg.attachments.first().url);
						
						// update embed thumbnail
						route.embed.setThumbnail(interaction.guild.iconURL());

						// send coordinates and DTC to user as DM
						collected.first().user.send({ embeds: [ route.embed ], files: [ dtc.get(fields.serial, route) ] });
						
						// clear interaction; it is ephemeral, so it cannot be deleted/dismissed
						await interaction.editReply({ embeds: [], components: [], content: 'You may now dismiss this message.' });
					} catch (e) {
						// log error
						console.error(e);
						
						// notify user of failure
						collected.first().user.send('There was a problem retrieving auto-route image.\n\nTukool has been notified.');
						
						// alert supreme nerd commander
						await interaction.client.channels.fetch('972510091242766396').send(`Mapbox problem:\n\n${e}\n\n${fields}`);
					}
				}
				
				try {
					// send the embed to the flight plan channel
					await interaction.guild.channels.cache.find(channel => channel.name.toLowerCase().includes('flight plans')).send({ embeds: [embed], components: [buttonRow1]});
					
					// send the flight plan as DM
					collected.first().user.send({embeds: [embed]});
					
					// send range info as DM for air-to-ground
					if (fields['taskings'] === 'AG') {
						collected.first().user.send({ embeds: [menus.getRangeInfo(fields['range'], false, interaction.guild.iconURL())] });
					}
			
					// save flight plan
					menus.saveFlightPlan(interaction.guildId, fields);
				} catch (e) {
					// log error
					console.error(e);
					
					// notify user of failure
					collected.first().user.send('There was a problem filing your flight plan.\n\nTukool has been notified.');
					
					// alert supreme nerd commander
					await interaction.client.channels.fetch('972510091242766396').send(`Flight plan problem:\n\n${e}\n\n${fields}`);
				}
			} else if (reason === 'idle') {
				try {
					const embed = new MessageEmbed()
						.setColor('#dd0000')
						.setTitle('Flight Plan Cancelled')
						.setDescription('Please re-submit your flight plan.')
						.setThumbnail(interaction.guild.iconURL());
					
					// update message to show cancelled
					interaction.editReply({ embeds: [embed], components: [] });
				} catch (e) {
					console.error(e.message);
				}
			}
		});
	}
};