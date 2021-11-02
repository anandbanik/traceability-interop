#!/usr/bin/env node
const { program , Option} = require('commander');
const https = require('https');
var newman = require('newman');

console.log('Traceability Interop Testing')

program.version('0.0.1');

program
    .option('-s, --service <file>', 'use the specified service provider test collection', './collections/service-providers.json')
    .option('-r, --reference <file>', 'use the specified reference VC test collection', './collections/reference-credentials.json');
// program
//     .option('-s, --service <file>', 'use the specified interop test collection', './collections/interop-credentials.json');

program
    .option('-sd, --servicedata <file>', 'use the specified service provider data collection', './data/service-providers.json')
    .option('-rd, --referencedata <file>', 'use the specified reference VC data collection', './data/reference-credentials.json');
// program
//     .option('-sd, --servicedata <file>', 'use the specified interop data collection', './data/interop-credentials.json');

program
    .option('-rd, --reportdir <folder>', 'use the specified service provider data collection', './newman');
program
    .addOption(new Option('-t, --tests <tests...>', 'use the specified tests, "none" is provided as an option for dev purposes', ['all']).choices([ 'all', 'service', 'reference', 'interop', 'none' ]));

program
    .option('-v, --verbose', 'verbose reporting', true)
    .option('-d, --dev', 'dev mode for advanced options', false);

program.parse();

var outputReporters = [ 'json', 'htmlextra' ]

if (program.opts().verbose) {
    outputReporters.push('cli');
}
if (program.opts().dev) {
    console.log('*** DEV MODE SET ***');
}

var serviceCollection = require(program.opts().service);
var serviceData = require(program.opts().servicedata);

// TODO: set reporter templates for htmlextra

// first setup and run base service provider validation
if (program.opts().tests.includes('all') || program.opts().tests.includes('service')) {
    newman.run({
        collection: serviceCollection,
        iterationData: serviceData,
        reporters: outputReporters,
        reporter: {
            json: { export: program.opts().reportdir+'/service-provider-report.json' },
            htmlextra: { export: program.opts().reportdir+'/service-provider-report.html' }
        }
    }, function (err) {
        if (err) { throw err; }
        console.log('Traceability Interop: Service Provider test complete');
    });
}


// then run reference checks (this should loop each server from the service provider collection )
if (program.opts().tests.includes('all') || program.opts().tests.includes('reference')) {
    // loop each service provider
    for (serviceIdx in serviceData) {
        var serv = serviceData[serviceIdx];
        console.log(serv);

        //get did from .well-known
        var didConfigURL = 'https://' + serv.serviceProvider.baseURL + '/.well-known/did-configuration.json';
        https.get(didConfigURL, (res) => {
            let body = "";
        
            res.on("data", (chunk) => {
                body += chunk;
            });
        
            res.on("end", () => {
                try {
                    let didConfig = JSON.parse(body);
                    console.log(didConfig);
                    // loop each provided did
                    for (didIdx in didConfig.linked_dids) {
                        var did = didConfig.linked_dids[didIdx];
                        newman.run({
                            collection: require(program.opts().reference),
                            iterationData: require(program.opts().referencedata),
                            reporters: outputReporters,
                            reporter: {
                                json: { export: program.opts().reportdir+'/'+serv.serviceProvider.baseURL+'reference-credentials-report.json' },
                                htmlextra: { export: program.opts().reportdir+'/'+serv.serviceProvider.baseURL+'reference-credentials-report.html' }
                            },
                            envVar: [
                                { "key": "name", "value": serv.name},
                                { "key": "server", "value": serv.serviceProvider.baseURL},
                                { "key": "prefix", "value": serv.serviceProvider.vcPrefix},
                                { "key": "did", "value": did.issuer},
                            ]
                        }, function (err) {
                            if (err) { throw err; }
                            console.log('Traceability Interop: Reference Credential test complete');
                        });    
                    }
                } catch (error) {
                    console.error(error.message);
                };
            });
        
        }).on("error", (error) => {
            console.error(error.message);
        });
    }
}
