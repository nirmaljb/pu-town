---
status: accepted
---

# Retain the Game Roster after Room Membership ends

The basic Mafia Game needs voting history and a final reveal for all original Players, including those who Leave or whose recovery expires. Retain a Game Roster for the lifetime of its Room independently of current Room Memberships: Elimination alone keeps membership, while Leave or expiry ends membership and causes a living Player to Forfeit without erasing their game identity, Seat association, or historical participation. This adds a separate participation lifecycle instead of treating the current membership list as the entire Game, preserving an intelligible result without granting departed Players recovery or fresh entry.

The roster does not reserve membership capacity, authorize a connection, or keep an otherwise empty Room alive. ADR 0009 still governs entry and final-membership removal; the Game Roster and its history disappear with the Room. Forfeit withdraws the departing Player's own pending choice and removes them from every majority and from the victory check, while a choice aimed at them stays locked and simply cannot take effect.
