import { publicConfig } from "../config";
import { useConvexAddressSearch, useConvexPropertyCard } from "./convex";
import { useRestAddressSearch, useRestPropertyCard } from "./rest";

// Valget er statisk (bestemt ved build), så hooks kaldes altid i samme rækkefølge.
const useConvex = Boolean(publicConfig.convexUrl);

export const usePropertyCard = useConvex ? useConvexPropertyCard : useRestPropertyCard;
export const useAddressSearch = useConvex ? useConvexAddressSearch : useRestAddressSearch;
