const fs = require('fs');

const collections = [
    'Admin_Postman_Collection.json',
    'FieldOwner_Postman_Collection.json',
    'FieldSelector_Postman_Collection.json',
    'Munshi_Postman_Collection.json',
    'OperationalManager_Postman_Collection.json',
    'Eicher_App_Collection.json',
    'Pickup_App_Collection.json'
];

collections.forEach(file => {
    if (!fs.existsSync(file)) return;
    let data = JSON.parse(fs.readFileSync(file, 'utf8'));

    // 1. Add "Get App Config" to all of them if not present
    const existsConfig = data.item.find(i => i.name === "Get App Config" || i.name === "App Config");
    if (!existsConfig) {
        data.item.push({
            name: "Get App Config",
            request: {
                method: "GET",
                header: [],
                url: {
                    raw: "{{baseUrl}}/api/master-data/app-config",
                    host: ["{{baseUrl}}"],
                    path: ["api", "master-data", "app-config"]
                },
                description: "Fetches dynamic app configuration (e.g. screenshot restrictions)."
            },
            response: []
        });
    }

    // 2. If Admin or FieldOwner, ensure Unassigned Plots is there
    if (file === 'FieldOwner_Postman_Collection.json' || file === 'Admin_Postman_Collection.json') {
        const listFolder = data.item.find(i => i.name && i.name.includes("Plots (Lists)"));
        if (listFolder) {
            const existsUnassigned = listFolder.item.find(i => i.name === "Get Unassigned Plots");
            if (!existsUnassigned) {
                listFolder.item.push({
                    name: "Get Unassigned Plots",
                    request: {
                        auth: {
                            type: "bearer",
                            bearer: [
                                {
                                    key: "token",
                                    value: file.includes('Admin') ? "{{adminToken}}" : "{{foToken}}",
                                    type: "string"
                                }
                            ]
                        },
                        method: "GET",
                        header: [],
                        url: {
                            raw: "{{baseUrl}}/api/field-owner/plots/unassigned?page=1&limit=20",
                            host: ["{{baseUrl}}"],
                            path: ["api", "field-owner", "plots", "unassigned"],
                            query: [
                                { key: "page", value: "1" },
                                { key: "limit", value: "20" }
                            ]
                        },
                        description: "Fetches all PENDING plots where NO Field Selector has been assigned yet."
                    },
                    response: []
                });
            }
        }
    }

    fs.writeFileSync(file, JSON.stringify(data, null, 4));
});

console.log('All Postman collections updated.');
