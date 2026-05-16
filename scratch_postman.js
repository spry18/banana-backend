const fs = require('fs');

function updateFieldSelector() {
    const file = './FieldSelector_Postman_Collection.json';
    if (!fs.existsSync(file)) return;
    let data = JSON.parse(fs.readFileSync(file, 'utf8'));

    // Avoid duplicate
    const exists = data.item.find(i => i.name === "Get App Config");
    if (!exists) {
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

    fs.writeFileSync(file, JSON.stringify(data, null, 4));
}

function updateFieldOwner() {
    const file = './FieldOwner_Postman_Collection.json';
    if (!fs.existsSync(file)) return;
    let data = JSON.parse(fs.readFileSync(file, 'utf8'));

    // Find "3 · All Plots (Lists)" folder
    const folder = data.item.find(i => i.name.includes("Plots (Lists)"));
    if (folder) {
        const exists = folder.item.find(i => i.name === "Get Unassigned Plots");
        if (!exists) {
            folder.item.push({
                name: "Get Unassigned Plots",
                request: {
                    auth: {
                        type: "bearer",
                        bearer: [
                            {
                                key: "token",
                                value: "{{foToken}}",
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

    fs.writeFileSync(file, JSON.stringify(data, null, 4));
}

updateFieldSelector();
updateFieldOwner();
console.log('Postman collections updated.');
