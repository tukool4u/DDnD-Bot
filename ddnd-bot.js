'use strict';

const { Client, Intents, MessageEmbed, MessageActionRow, MessageButton } = require('discord.js');
const { bold, italic, inlineCode, codeBlock } = require('@discordjs/builders');

const crypto = require('crypto');
const https = require('https');
const fs = require('fs');

const { token } = require('./config.json');

const menus = require('./menus.js');
const flightplan = require('./commands/flightplan.js');
const ato = require('./commands/ato.js');

const client = new Client({
	intents: [ Intents.FLAGS.DIRECT_MESSAGES, Intents.FLAGS.DIRECT_MESSAGE_REACTIONS, Intents.FLAGS.GUILD_MEMBERS, Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MESSAGE_REACTIONS ],
	partials: [ 'MESSAGE', 'CHANNEL', 'REACTION' ]
});

function downloadImageFromDiscord(url) {
	const filename = crypto.randomBytes(3).toString('hex') + '.png';
	
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode === 200) {
                res.pipe(fs.createWriteStream(`./fp_images/${filename}`))
                    .on('error', reject)
                    .once('close', () => resolve(`./fp_images/${filename}`));
            } else {
                // Consume response data to free up memory
                res.resume();
				
                reject(new Error(`Request Failed With a Status Code: ${res.statusCode}`));
            }
        });
    });
}

process.on('SIGINT', function() {
	console.log('SIGINT received');
	
	console.log(`Destroying DDnD Bot.`);
	
	client.destroy();
});

client.on('ready', () => {
	console.log(`DDnD Bot has started in ${client.guilds.cache.size} servers.`);
	
	client.user.setActivity(`${client.guilds.cache.size} servers for adventurers.`, ({type: "WATCHING"}));
});

client.on('error', (error) => {
    console.error(error);
});

client.on('guildCreate', guild => {
	console.log(`DDnD Bot added to ${client.guilds.fetch(guild.id).name}(${guild.id}).`);
	
	client.channels.fetch('1031635144580276325').send(`Opso Bot added to ${client.guilds.fetch(guild.id).name}(${guild.id}).`);
  
	client.user.setActivity(`${client.guilds.cache.size} servers for adventurers.`, ({type: "WATCHING"}));
});

client.on('guildDelete', guild => {
	console.log(`DDnD Bot removed for ${client.guilds.fetch(guild.id).name}(${guild.id}).`);
	
	client.channels.fetch('1031635144580276325').send(`DDnD Bot removed from ${client.guilds.fetch(guild.id).name}(${guild.id}).`);
  
	client.user.setActivity(`${client.guilds.cache.size} servers for adventurers.`, ({type: "WATCHING"}));
});

client.on('interactionCreate', async interaction => {
	// set user name based on presence of nickname (really only needed where nicknames aren't used, i.e. Reaper server)
	interaction.author = interaction.member.nickname ? interaction.member.nickname : interaction.user.username;
	
	// handle autocomplete
	if (interaction.isAutocomplete()) {
		if (interaction.commandName === 'rangeinfo') {
			interaction.respond(menus.getRangeOptions());
		}
	}
	
	// handle button interactions
	if (interaction.isButton()) {
		// get flight plan/ATO serial number
		const serial = ['ACK', 'DEL', 'FIN'].includes(interaction.customId.substring(0, 3)) ? interaction.customId.split('-')[1] : interaction.customId;
		
		// get all messages to find applicable flight plan/ATO
		interaction.channel.messages.fetch().then(messages => {
			// get individual message (flight plan or ATO determined by serial)
			const msg = messages.filter(messages => messages.embeds.length > 0).find(messages => messages.embeds[0].title.includes(serial));

			// cancel flight plan - TODO: need a better filter for flight plan cancellations rather than checking if it is the 'flight plans' channel
			if (interaction.channel.name.toLowerCase().includes('flight plans')) {
				// flight plans are further filtered by author to prevent wrongful cancellations
				if (msg.embeds[0].author.name === interaction.author) {
					menus.cancelFlightPlan(interaction).then(embed => {
						// delete message
						msg.delete();
					
						// post notification of deleted flight plan
						interaction.reply({ embeds: [embed] });
					}).catch(e => {
						// log error
						console.error(e, interaction);
						
						// update interaction to clear embeds/components and inform user of error
						interaction.reply({ ephemeral: true, embeds: [], components: [], content: 'There was a problem canceling this flight plan. tukool has been notified.' });
						
						// log to discord
						client.channels.fetch('972510091242766396').then(c => c.send(`${codeBlock(e.stack)}`));
					});
				} else {
					// notify non-owner
					interaction.reply({ ephemeral: true, content: 'You are not the owner of this flight plan.' });
				}
			}
			
			// ACK ATO assignment - 'ACK-serial-pilot'
			if (interaction.customId.split('-')[0] === 'ACK') {
				const pilot = interaction.customId.split('-')[2];
				const embed = new MessageEmbed(msg.embeds[0]);
				const field = embed.fields.pop();
				const buttonRow = msg.components[0];
				const regex = new RegExp(`^[\\>]*\\s?(\\d+\\:\\s${pilot.replace(/\|/g, '\\|')})$`, 'img');
				
				if (field.value.includes(pilot)) {
					if ([interaction.member.nickname, interaction.user.username].includes(pilot)) {
						// remove pilot button
						buttonRow.components = buttonRow.components.filter(b => b.label !== pilot)
						
						// show pilot ACK
						field.value = field.value.replace(regex, '✅ $1');
						
						// update pilot to show ACK
						embed.spliceFields(0, 1, field);
					
						// update buttons to show pilot ACKs
						if (buttonRow.components.length > 1) {
							// update embed to show remaining pilots who need to ACK
							msg.edit({ embeds: [embed], components: [ buttonRow ] });
						} else {
							// all pilots have acknowledged, add 'complete' button
							buttonRow.addComponents(
								new MessageButton()
									.setCustomId(`FIN-${embed.title}-${embed.author.name}`)
									.setLabel('completed')
									.setStyle('PRIMARY')
									.setDisabled(false)
							);
							
							// update embed to remove pilot ACK buttons
							msg.edit({ embeds: [embed], components: [ buttonRow ] });
							
							// alert author that all pilots have acknowledged
							interaction.guild.members.fetch({ query: embed.author.name }).then(members => {
								members.find(m => [m.nickname, m.user.username].includes(embed.author.name)).send(`All pilots have acknowledged receipt of ${serial}`);
							});
						}
						
						// ack the ack
						interaction.reply({ ephemeral: true, content: 'You have successfully acknowledged your ATO assignment.\n\nYou may dismiss this message.' });
					} else {
						// warn not assigned button
						interaction.reply({ ephemeral: true, content: 'This is not your assigned acknowledgement.' });
					}
				} else {
					// notify non-owner
					interaction.reply({ ephemeral: true, content: 'You are not assigned to this ATO.' });
				}
			}
			
			// completed ATO - 'FIN-serial-author'
			if (interaction.customId.split('-')[0] === 'FIN') {
				const pilot = interaction.customId.split('-')[2];
				const embed = new MessageEmbed(msg.embeds[0]);
				
				if (embed.fields[0].value.includes(pilot) && pilot === interaction.author) {
					// alert author that all pilots have acknowledged
					interaction.guild.members.fetch({ query: embed.author.name }).then(members => {
						members.find(m => [m.nickname, m.user.username].includes(embed.author.name)).send(`${serial} has been completed.`);
					});
					
					embed.setFooter({ text: `Completed on ${new Date()}.` });
					
					// remove cancel/completed buttons since ATO is complete
					msg.edit({ embeds: [embed], components: [ ] });
					
					// ACK the FIN
					interaction.reply({ ephemeral: true, content: 'Your squadron commander has been notified.\n\nPlease upload the ACMI for this ATO.' });
				} else {
					// notify non-owner
					interaction.reply({ ephemeral: true, content: 'You are not assigned to this ATO.' });
				}
			}
		
			// cancel ATO - 'DEL-serial-pilot'
			if (interaction.customId.split('-')[0] === 'DEL') {
				const author = interaction.customId.split('-')[2];
				const embed = new MessageEmbed(msg.embeds[0]);
				const field = embed.fields.pop();
				
				if (embed.author.name === author) {
					menus.cancelATO(interaction).then(embed => {
						// delete message
						msg.delete();
					
						// post notification of deleted flight plan
						interaction.reply({ embeds: [embed] });
					}).catch(e => {
						// log error
						console.error(e, interaction);
						
						// update interaction to clear embeds/components and inform user of error
						interaction.reply({ ephemeral: true, embeds: [], components: [], content: 'There was a problem canceling this ATO. tukool has been notified.' });
						
						// log to discord
						client.channels.fetch('972510091242766396').then(c => c.send(`${codeBlock(e.stack)}`));
					});
				} else {
					// notify non-owner
					interaction.reply({ ephemeral: true, content: 'You are not owner of this ATO.' });
				}
			}
		}).catch (e => {
			// log error
			console.error(e);
			
			// update interaction to clear embeds/components and inform user of error
			interaction.reply({ ephemeral: true, embeds: [], components: [], content: 'There was a problem with this interaction. tukool has been notified.' });
			
			// log to discord
			client.channels.fetch('1031635144580276325').then(c => c.send(`${codeBlock(e.stack)}`));
		});
			
		// end button interaction
		return;
	}
	
	// filter non-command interactions
	if (!interaction.isCommand() && !interaction.isSelectMenu()) return;
	
	// begin command interface
	if (interaction.commandName === 'rangeinfo') {
			const rangeEmbed = menus.getRangeInfo(interaction.options.getString('range'), true, interaction.guild.iconURL());
			
			interaction.reply({ ephemeral: true, embeds: [rangeEmbed] });
	} else if (interaction.commandName === 'active') {
        const activeEmbed = await menus.getActiveFlightPlans(interaction.guild);

		interaction.reply({ ephemeral: true, embeds: [activeEmbed] });
	} else if (interaction.commandName === 'clear') {
        const clearEmbed = await menus.clearRange(interaction.guildId, interaction.options.getString('range'));
        
        interaction.reply({ ephemeral: true, embeds: [clearEmbed] });
	} else if (interaction.commandName === 'pnc') {
		const pncs = menus.getPNCs().join('\n');

		interaction.reply({ ephemeral: true, content: `${bold('Naming Conventions')}:\n${codeBlock(pncs)}` });
	} else if (interaction.commandName === 'threats') {
		const threats = menus.getThreats(interaction.options.getString('threat')).join('\n');

		interaction.reply({ ephemeral: true, content: `${bold('Threats')}:\n${codeBlock(threats)}` });
	} else if (interaction.commandName === 'scl') {
		try {
			const airframe = interaction.options.getString('airframe');
			const target = interaction.options.getString('target');
			const scls = menus.getSCLs(airframe).scls.filter(s => s.filter.includes(target)).map(s => `${s.scl.padEnd(20)}${s.rem}`).join('\n');
			const notes = menus.getSCLs(airframe).notes.join('\n');
			
			if (scls)
				interaction.reply({ ephemeral: true, content: `${bold('SCLs')}:\n${codeBlock(scls)}\n${bold('NOTES')}\n${codeBlock(notes)}` });
			else
				interaction.reply({ ephemeral: true, content: "NO SCL FOUND FOR THIS AIRFRAME/TARGET TYPE" });
		} catch (e) {
			// log error
			console.error(e);
			
			// update interaction to clear embeds/components and inform user of error
			interaction.reply({ ephemeral: true, embeds: [], components: [], content: 'There was a problem with this interaction. tukool has been notified.' });
			
			// log to discord
			client.channels.fetch('1031635144580276325').then(c => c.send(`${codeBlock(e.stack)}`));
		}
	} else if (interaction.commandName === 'flightplan') {
		try {
			await flightplan.execute(interaction);
		} catch (e) {
			// log error
			console.error(e);
			
			// update interaction to clear embeds/components and inform user of error
			interaction.reply({ ephemeral: true, embeds: [], components: [], content: 'There was a problem creating this flight plan. tukool has been notified.' });
			
			// log to discord
			client.channels.fetch('1031635144580276325').then(c => c.send(`${codeBlock(e.stack)}`));
		}
	} else if (interaction.commandName === 'ato') {
		try {
			await ato.execute(interaction);
		} catch (e) {
			// log error
			console.error(e);
			
			// update interaction to clear embeds/components and inform user of error
			interaction.reply({ ephemeral: true, embeds: [], components: [], content: 'There was a problem creating this ATO. tukool has been notified.' });
			
			// log to discord
			client.channels.fetch('1031635144580276325').then(c => c.send(`${codeBlock(e.stack)}`));
		}
	}
});

client.on('messageCreate', async message => {
	// update flight plan with uploaded image (non-auto-routed flight plans)
    if (message.attachments.size > 0 && !message.author.bot && message.channel.name.toLowerCase().includes('flight plans')) {
		const author = message.member.nickname ? message.member.nickname : message.author.username;
				
		// get all messages - TODO: improve fetch; will bottleneck with many messages
		const messages = await message.channel.messages.fetch();
			
		// find all messages with embeds, then get the newest message by the user
		const d = messages.filter(msg => msg.embeds.length > 0).filter(m => author === m.embeds[0].author.name).first();
		
		// create new embed per https://discordjs.guide/popular-topics/embeds.html#using-an-embed-object-1
		const tempEmbed = new MessageEmbed(d.embeds[0]);
		
		// do not update cancelation notices
		if (!tempEmbed.title.toLowerCase().includes("canceled")) {
			// save image
			downloadImageFromDiscord(message.attachments.first().url)
				.then(filename => {
					// copy image to storage channel and update flight plan
					const msg = message.guild.channels.cache.find(channel => channel.name === 'plan-pictures').send({ files: [ filename ] }).then(m => {
						// update embed with flight plan image
						tempEmbed.setImage(m.attachments.first().url);
					
						// update the message
						d.edit({ embeds: [tempEmbed] });
					});
				}).catch(e => {
					// log error
					console.error(e);
					
					// update interaction to clear embeds/components and inform user of error
					message.author.send('There was a problem getting your flight plan image from Discord. tukool has been notified.');
					
					// log to discord
					client.channels.fetch('1031635144580276325').then(c => c.send(`${codeBlock(e.stack)}`));
				});
		}
		
		// delete the posted image
		message.delete();
    }		
});

client.on('messageReactionAdd', async (reaction, user) => {
	// When a reaction is received, check if the structure is partial
	if (reaction.partial) {
		// If the message this reaction belongs to was removed, the fetching might result in an API error which should be handled
		try {
			await reaction.fetch();
		} catch (error) {
			console.error('Something went wrong when fetching the message:', error);
			
			// Return as `reaction.message.author` may be undefined/null
			return;
		}
	}
	
	if (reaction.emoji.name === '🤪') {
		const role = reaction.message.guild.roles.cache.find(r => r.name === 'Testers');
		
		reaction.message.guild.members.cache.find(m => m.id === user.id).roles.add(role);
	}
	
	// find ATO and acknowledge with :accepted:
	

	// Now the message has been cached and is fully available
	console.log(`${reaction.message.author}'s message "${reaction.message.content}" gained a reaction (${reaction.emoji.name})!`);
	// The reaction is now also fully available and the properties will be reflected accurately:
	console.log(`${reaction.count} user(s) have given the same reaction to this message!`);
});

// login to activate client
client.login(token);