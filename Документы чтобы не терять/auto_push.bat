@echo off
cd /d C:\AIProgram\CallManager\Cursor2

echo === Проверка статуса ===
git status

echo === Добавление изменений ===
git add .

echo === Создание коммита ===
git commit -m "Автоматическая отправка системного промпта при подключении"

echo === Отправка в GitHub ===
git push origin main

echo === Готово ===
pause
