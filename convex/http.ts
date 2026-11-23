import { httpRouter } from "convex/server";
import { claimDelivery, completeDelivery, overdueLoans, recordIncident } from "./automation/http";

const http = httpRouter();
http.route({ path: "/automation/overdue-loans", method: "GET", handler: overdueLoans });
http.route({ path: "/automation/deliveries/claim", method: "POST", handler: claimDelivery });
http.route({ path: "/automation/deliveries/complete", method: "POST", handler: completeDelivery });
http.route({ path: "/automation/incidents", method: "POST", handler: recordIncident });
export default http;
