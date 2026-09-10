# TODO

1. [ ] hromadná rezervace pro admin uživatele musí rezervovat vždy jen pro něj samotného
2. [ ] admin user - detail rezervace místa - pridání uživatele do fronty musí vyfiltrovat uživatele, kteří již mají na místo rezervaci nebo čekají ve frontě
3. [x] chybové hlášky - některé chybové hlášky se zobrazují v domu místo toho aby vyskočily jako toast/alert nahoře v pravém rohu aplikace. Příkladem jsou chybové hlášky v detailu rezervace při přidávání uživatele do fronty. Najdi i podobné případy v aplikaci a uprav to aby se chyby zobrazovaly jako alerty v pravém horním rohu (main@e0d44b0)
4. [x] nezobrazovat "SPZ neuvedena" u rezervací, kde uživatelé nemají vyplněnou SPZ (main@0978607)
5. [x] stejný případ jako pro bod 3. akorát pro úspěšné hlášky. Například při vytvoření hromadné rezervace zobrazit success alert v pravém horním rohu (main@8794c0c)
6. [x] šipky v datumové navigaci v headeru by měly přeskakovat výkendy tedy z pátku skočit rovnou na pondělí. Stejně tak bych neměl být schopen v celé aplikaci vybrat víkendový den. Projdi kalendáře a disabluj víkendy. (main@8b3e2cf)
