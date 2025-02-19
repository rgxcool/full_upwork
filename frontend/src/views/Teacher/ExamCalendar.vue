<template>
  <div class="calendar-container">
    <aside class="sidebar">
      <div class="html-datepicker">
        <div class="mini-calendar">
          <div class="nav-buttons">
            <button @click="prevYear">&#171;</button> <!-- Föregående år -->
            <button @click="prevMonth">&#8249;</button> <!-- Föregående månad -->
            <h3>{{ selectedMonth }}</h3>
            <button @click="nextMonth">&#8250;</button> <!-- Nästa månad -->
            <button @click="nextYear">&#187;</button> <!-- Nästa år -->
          </div>
        </div>        
        <table>
          <thead>
            <tr>
              <th v-for="day in weekDaysShort" :key="day">{{ day }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="week in calendarGrid" :key="week">
              <td v-for="day in week" :key="day.date" @click="selectDate(day.date)" :class="{ 'selected': day.date === selectedDateFormatted }">
                {{ day.day }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </aside>
    
    <div class="main-calendar">
      <div class="header">
        <button @click="prevWeek"><</button>
        <h2>Vecka {{ currentWeekNumber }}</h2>
        <button @click="nextWeek">></button>
      </div>
      
      <div class="week-header">
  <div v-for="day in weekDays" :key="day.date" class="week-day">
    <span class="day-name">{{ day.label.substring(0, 3).toUpperCase() }}</span>
    <span class="day-number">{{ day.date.split('-')[2] }}</span>
  </div>
</div>

<div class="week-view">
  <div class="time-column">
    <div v-for="hour in hours" :key="hour" class="time-label">{{ hour }}:00</div>
  </div>
  <div v-for="day in weekDays" :key="day.date" class="day-column" :data-date="day.date">
    <draggable v-model="day.events" group="events" @end="updateEventDate" item-key="id">
      <template #item="{ element }">
        <div class="event">{{ element.title }}</div>
      </template>
    </draggable>
  </div>
</div>

      
      <button @click="addEvent">Lägg till event</button>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue';
import draggable from 'vuedraggable';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import weekOfYear from 'dayjs/plugin/weekOfYear';

dayjs.extend(isoWeek);
dayjs.extend(weekOfYear);

export default {
  components: { draggable },
  setup() {
    const selectedDate = ref(dayjs().toDate());
    const events = ref([]);

    const selectedMonth = computed(() => dayjs(selectedDate.value).format('MMMM YYYY'));
    const selectedDateFormatted = computed(() => dayjs(selectedDate.value).format('YYYY-MM-DD'));

    const weekDaysShort = ['M', 'T', 'O', 'T', 'F', 'L', 'S'];

    const calendarGrid = computed(() => {
      const startOfMonth = dayjs(selectedDate.value).startOf('month').startOf('week');
      return Array.from({ length: 6 }, (_, row) => {
        return Array.from({ length: 7 }, (_, col) => {
          const date = startOfMonth.add(row * 7 + col, 'day');
          return { date: date.format('YYYY-MM-DD'), day: date.date() };
        });
      });
    });

    const selectDate = (date) => {
      selectedDate.value = dayjs(date).toDate();
    };

    const currentWeekNumber = computed(() => dayjs(selectedDate.value).week());
    const hours = Array.from({ length: 24 }, (_, i) => i);

    const weekDays = computed(() => {
      const startOfWeek = dayjs(selectedDate.value).startOf('isoWeek');
      return Array.from({ length: 7 }, (_, i) => {
        const date = startOfWeek.add(i, 'day');
        return { date: date.format('YYYY-MM-DD'), label: date.format('dddd'), events: events.value.filter(e => e.date === date.format('YYYY-MM-DD')) };
      });
    });

    const prevWeek = () => selectedDate.value = dayjs(selectedDate.value).subtract(1, 'week').toDate();
    const nextWeek = () => selectedDate.value = dayjs(selectedDate.value).add(1, 'week').toDate();

    const prevMonth = () => {
      selectedDate.value = dayjs(selectedDate.value).subtract(1, 'month').toDate();
    };

    const nextMonth = () => {
      selectedDate.value = dayjs(selectedDate.value).add(1, 'month').toDate();
    };

    const prevYear = () => {
      selectedDate.value = dayjs(selectedDate.value).subtract(1, 'year').toDate();
    };

    const nextYear = () => {
      selectedDate.value = dayjs(selectedDate.value).add(1, 'year').toDate();
    };


    const addEvent = () => {
      events.value.push({ id: Date.now(), title: 'Nytt Event', date: dayjs(selectedDate.value).format('YYYY-MM-DD') });
    };
    
    const updateEventDate = (event) => {
      event.item.date = event.to.querySelector('.day-column').getAttribute('data-date');
    };
    
    onMounted(() => {
      events.value = [
        { id: 1, title: 'Möte', date: dayjs().format('YYYY-MM-DD') },
        { id: 2, title: 'Workshop', date: dayjs().add(1, 'day').format('YYYY-MM-DD') }
      ];
    });
    
    return { selectedDate, selectedMonth, selectedDateFormatted, weekDaysShort, calendarGrid, selectDate, currentWeekNumber, weekDays, prevWeek, nextWeek, addEvent, updateEventDate, hours };
  }
};
</script>

<style>
.calendar-container { display: flex; }
.sidebar { width: 300px; padding: 10px; border-right: 1px solid #ccc; background: #f8f9fa; display: flex; flex-direction: column; align-items: center; }
.html-datepicker { text-align: center; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 10px; text-align: center; cursor: pointer; }
th { background: #f1f3f4; }
td.selected { background: #007bff; color: white; border-radius: 50%; }
.main-calendar { flex: 1; padding: 10px; }

.header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px; /* Mindre mellanrum mellan elementen */
}
.week-view { display: grid; grid-template-columns: 60px repeat(7, 1fr); border: 1px solid #ccc; background: #fff; }
.time-column { display: flex; flex-direction: column; }
.time-label { height: 50px; text-align: center; border-bottom: 1px solid #ccc; background: #f1f3f4; font-size: 12px; }
.day-column { border-left: 1px solid #ccc; padding: 5px; min-height: 1200px; background: #f9f9f9; }
.events { position: relative; min-height: 100px; }
.event { background: #007bff; color: #fff; padding: 5px; margin: 5px 0; cursor: grab; border-radius: 4px; font-size: 12px; position: relative; }
.event:hover { background: #0056b3; }

.week-header {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  text-align: center;
  padding: 10px 0;
}

.week-day {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 14px;
  color: #666;
}

.day-name {
  font-size: 12px;
  text-transform: uppercase;
}

.day-number {
  font-size: 18px;
  font-weight: bold;
}


.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
}

.mini-calendar {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.mini-calendar .nav-buttons {
  display: flex;
  justify-content: space-between;
  width: 100%;
  margin-bottom: 5px;
}

.mini-calendar table {
  width: 100%;
  border-collapse: collapse;
}

.mini-calendar th, .mini-calendar td {
  padding: 10px;
  text-align: center;
  font-size: 14px;
  color: #333;
}

.mini-calendar th {
  font-weight: bold;
  color: #666;
}

.mini-calendar td.selected {
  background: #007bff;
  color: white;
  border-radius: 50%;
}

.draggable-container {
  display: flex;
  flex-direction: column;
  min-height: 100px;
}

.event {
  background: #007bff;
  color: #fff;
  padding: 5px;
  margin: 5px 0;
  cursor: grab;
  border-radius: 4px;
  font-size: 12px;
  position: relative;
}

.event:hover {
  background: #0056b3;
}



@media (max-width: 768px) {
  .sidebar {
    display: none;
  }
  .mobile-datepicker {
    display: block;
  }
}

@media (min-width: 769px) {
  .mobile-datepicker {
    display: none;
  }
}
</style>
